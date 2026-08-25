"""Tek bir strateji config'i için çalıştırma döngüsü.

Her strateji bağımsız bir StrategyRunner örneğiyle çalışır:
- Kendi Symbol/timeframe'i
- Kendi indikatör config'i (SignalEngine)
- Kendi risk profili (position sizing / stop-take / circuit breaker)
- Kendi broker (paper) + position manager + trade logger

Ana akış: websocket'ten gelen her kap. mum -> sinyal değerlendirme ->
eşik -> açık pozisyon yoksa ve kurallar uygunsa emir -> stop/take takibi.
"""
import asyncio
import logging

from .config_loader import load_global_config
from .data.binance_client import BinanceClient
from .data.candle_stream import CandleStream
from .execution.base import OrderRequest
from .execution.paper_broker import PaperBroker as _PaperBroker
from .portfolio.trade_logger import TradeLogger
from .portfolio.position_manager import Position, PositionManager
from .risk.registry import get_risk_profile
from .risk.circuit_breaker import CircuitBreaker
from .risk.position_sizing import calculate_position_size
from .risk.stop_take import calculate_stop_take
from .signals.signal_engine import SignalEngine

logger = logging.getLogger(__name__)


class StrategyRunner:
    """Tek bir strateji config'ini paper modunda çalıştıran döngü."""

    def __init__(self, strategy_cfg: dict, global_cfg: dict):
        self.cfg = strategy_cfg
        self.global_cfg = global_cfg
        self.strategy_id = strategy_cfg["strategy_id"]
        self.symbol = strategy_cfg["symbol"]
        self.timeframe = strategy_cfg.get("timeframe", "5m")
        self.risk_name = strategy_cfg.get("risk_level", "medium")
        self.profile = get_risk_profile(self.risk_name)

        # Bileşenler
        self.engine = SignalEngine(
            indicator_configs=strategy_cfg.get("indicators", {}),
            rules=strategy_cfg.get("rules", []),
        )
        paper_cfg = global_cfg.get("paper_trading", {})
        db_cfg = global_cfg.get("database", {})
        self.broker = _PaperBroker(
            starting_balance=paper_cfg.get("starting_balance", 10000),
            taker_fee=paper_cfg.get("taker_fee", 0.0004),
            maker_fee=paper_cfg.get("maker_fee", 0.0002),
        )
        self.position_manager = PositionManager(max_open_positions=self.profile.max_open_positions)
        self.circuit = CircuitBreaker(
            daily_loss_limit_pct=self.profile.daily_loss_limit_pct,
            starting_balance=self.broker.balance,
        )
        self.logger_db = TradeLogger(db_path=db_cfg.get("path", "data/bot.db"))
        self.trade_ids: dict = {}   # order_id -> db trade_id

        # Veri katmanı
        stream_cfg = global_cfg.get("streaming", {})
        buffer = int(stream_cfg.get("candle_buffer_size", 500))
        self.stream = CandleStream(
            symbol=self.symbol,
            timeframe=self.timeframe,
            buffer_size=buffer,
            reconnect_max_attempts=int(stream_cfg.get("reconnect_max_attempts", 5)),
        )
        self.client = BinanceClient()
        self._running = True

    async def _check_and_close_positions(self, df):
        """Stop/take seviyelerine ulaşan pozisyonları kapatır."""
        latest_price = float(df["close"].iloc[-1])
        for pos in list(self.position_manager.all_open()):
            if pos.hit_stop(latest_price):
                exit_price = pos.stop_price
                reason = f"stop ({pos.stop_price:.4f}) tetiklendi"
                result = "loss"
            elif pos.hit_take(latest_price):
                exit_price = pos.take_price
                reason = f"take ({pos.take_price:.4f}) tetiklendi"
                result = "win"
            else:
                continue
            await self._close_position(pos, exit_price, reason, result)

    async def _close_position(self, pos, exit_price, reason, result="win"):
        """Pozisyonu paper broker üzerinden kapatır ve loglar."""
        res = await self.broker.close_position(pos.position_id, exit_price)
        pnl = res.meta.get("pnl", 0.0)
        trade_id = self.trade_ids.get(pos.position_id)
        if trade_id is not None:
            self.logger_db.close_trade(trade_id, exit_price, pnl, result=result)
        self.circuit.record_trade_pnl(pnl)
        logger.info("[%s] %s için pozisyon kapandı: %s pnl=%.2f",
                    self.strategy_id, pos.symbol, reason, pnl)

    async def _open_position(self, df, direction, confidence):
        """Sinyal yönüne göre risk hesaplayıp paper emir açar."""
        profile = self.profile
        latest = df.iloc[-1]
        price = float(latest["close"])
        atr_params = self.cfg.get("indicators", {}).get("atr", {})
        atr_period = int(atr_params.get("period", 14))
        atr_col = f"atr_{atr_period}"
        atr = float(latest[atr_col]) if atr_col in df.columns else price * 0.01

        sizing = calculate_position_size(
            balance=self.broker.balance, price=price, atr_value=atr, profile=profile,
        )
        st = calculate_stop_take(
            entry_price=price, atr_value=atr, side=direction,
            stop_atr_mult=profile.stop_atr_mult, take_atr_mult=profile.take_atr_mult,
        )
        quantity = sizing["quantity"]
        if quantity <= 0:
            return None
        req = OrderRequest(
            symbol=self.symbol, side=direction, quantity=quantity, entry_price=price,
            stop_price=st["stop_price"], take_price=st["take_price"],
            leverage=profile.leverage, strategy_id=self.strategy_id,
            confidence_score=confidence.get("best_score", 0.0),
        )
        res = await self.broker.open_position(req)
        if res.status == "opened":
            pos = Position(
                position_id=res.order_id, strategy_id=self.strategy_id, symbol=self.symbol,
                side=direction, quantity=quantity, entry_price=res.entry_price,
                stop_price=res.stop_price, take_price=res.take_price, leverage=profile.leverage,
                confidence_score=req.confidence_score,
            )
            try:
                self.position_manager.open_position(pos)
            except RuntimeError:
                logger.warning("[%s] pozisyon limiti — açılamadı", self.strategy_id)
                return res
            trade_id = self.logger_db.open_trade(
                strategy_id=self.strategy_id, symbol=self.symbol, side=direction,
                entry_price=res.entry_price, quantity=quantity,
                confidence_score=req.confidence_score,
                stop_price=res.stop_price, take_price=res.take_price,
                reason=confidence.get("best_direction", direction),
            )
            self.trade_ids[res.order_id] = trade_id
        return res

    async def _on_new_candle(self, df):
        """Kapanan her mumda çağrılır: kapatma + sinyal + açma."""
        min_conf = float(self.cfg.get("entry", {}).get("min_confidence_threshold",
                                                       self.profile.min_confidence))
        await self._check_and_close_positions(df)
        if not self.position_manager.can_open():
            return
        if self.circuit.should_stop_trading():
            return
        decision = self.engine.evaluate(df, min_confidence=min_conf)
        direction = decision["direction"]
        conf = decision["confidence"]
        self.logger_db.log_signal(
            strategy_id=self.strategy_id, symbol=self.symbol, timeframe=self.timeframe,
            signal=direction, confidence=conf["best_score"],
            votes=decision["votes"], weights=decision["weights"],
            risk_level=self.risk_name, threshold=min_conf,
            decision="open" if direction != "none" else "no_op",
            reason="; ".join(decision["decision_reasons"]),
        )
        if direction != "none":
            try:
                await self._open_position(df, direction, conf)
            except Exception:
                logger.exception("[%s] emir açılırken hata", self.strategy_id)

    async def run(self):
        """Veriyi önyükler ve websocket akışını başlatır."""
        await self.stream.preload(self.client)
        self.stream.on_new_candle(self._on_new_candle)
        await self.stream.run()