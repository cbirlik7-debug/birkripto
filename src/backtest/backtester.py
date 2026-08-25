"""Backtest motoru (Bölüm 12).

Geçmiş kline verisi üzerinde bir strateji config'ini simüle eder:
- Her kapanışta sinyal motoruyla yaklaşım değerlendirilir
- Eşik sağlanırsa pozisyon açılır; stop/take fiyatlarıyla kapatılır
- Çıktı: toplam getiri, win rate, ortalama R:R, max drawdown, işlem sayısı

Grid search (faz parametre taraması) için `Backtester.run_grid` da sunulur.
"""
import logging
import math
from dataclasses import dataclass, field

import pandas as pd

from ..risk.position_sizing import calculate_position_size
from ..risk.stop_take import calculate_stop_take
from ..risk.registry import get_risk_profile
from ..signals.signal_engine import SignalEngine

logger = logging.getLogger(__name__)


@dataclass
class TradeRecord:
    symbol: str
    side: str
    entry_time: str
    exit_time: str
    entry_price: float
    exit_price: float
    pnl: float
    pnl_pct: float
    r_multiple: float
    stop_price: float
    take_price: float
    confidence: float

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol, "side": self.side,
            "entry_time": self.entry_time, "exit_time": self.exit_time,
            "entry_price": self.entry_price, "exit_price": self.exit_price,
            "pnl": self.pnl, "pnl_pct": self.pnl_pct, "r_multiple": self.r_multiple,
            "stop_price": self.stop_price, "take_price": self.take_price,
            "confidence": self.confidence,
        }


@dataclass
class BacktestResult:
    strategy_id: str
    symbol: str
    trades: list = field(default_factory=list)
    initial_balance: float = 10000.0
    final_balance: float = 10000.0

    @property
    def total_return(self) -> float:
        return (self.final_balance / self.initial_balance - 1) if self.initial_balance > 0 else 0.0

    @property
    def win_rate(self) -> float:
        if not self.trades:
            return 0.0
        wins = sum(1 for t in self.trades if t.pnl > 0)
        return wins / len(self.trades)

    @property
    def avg_rr(self) -> float:
        if not self.trades:
            return 0.0
        return sum(t.r_multiple for t in self.trades) / len(self.trades)

    @property
    def max_drawdown(self) -> float:
        peak = -math.inf
        max_dd = 0.0
        running = self.initial_balance
        for t in self.trades:
            running += t.pnl
            peak = max(peak, running)
            max_dd = max(max_dd, (peak - running) / peak if peak > 0 else 0.0)
        return max_dd

    def summary(self) -> dict:
        return {
            "strategy_id": self.strategy_id,
            "symbol": self.symbol,
            "trade_count": len(self.trades),
            "total_return": round(self.total_return, 4),
            "win_rate": round(self.win_rate, 4),
            "avg_rr": round(self.avg_rr, 4),
            "max_drawdown": round(self.max_drawdown, 4),
            "initial_balance": self.initial_balance,
            "final_balance": round(self.final_balance, 2),
        }

class Backtester:
    """Geçmiş veri üzerinde strateji simülasyonu."""

    def __init__(self, strategy_cfg: dict, initial_balance: float = 10000.0,
                 fee_rate: float = 0.0004):
        self.cfg = strategy_cfg
        self.strategy_id = strategy_cfg.get("strategy_id", "unknown")
        self.symbol = strategy_cfg.get("symbol", "")
        self.profile = get_risk_profile(strategy_cfg.get("risk_level", "medium"))
        self.initial_balance = initial_balance
        self.fee_rate = fee_rate

    def _build_engine(self, extra: dict = None) -> SignalEngine:
        ind_cfg = dict(self.cfg.get("indicators", {}))
        if extra:
            for k, v in extra.items():
                if k in ind_cfg and isinstance(ind_cfg[k], dict):
                    ind_cfg[k] = {**ind_cfg[k], **v}
        return SignalEngine(indicator_configs=ind_cfg, rules=self.cfg.get("rules", []))

    def run(self, df: pd.DataFrame, min_confidence: float = None) -> BacktestResult:
        """OHLCV DataFrame üzerinde backtest koşar."""
        if min_confidence is None:
            min_confidence = float(self.cfg.get("entry", {}).get(
                "min_confidence_threshold", self.profile.min_confidence))
        engine = self._build_engine()
        engine.calculate_all(df)   # tüm indikatör kolonlarını ekle

        balance = self.initial_balance
        result = BacktestResult(self.strategy_id, self.symbol,
                                initial_balance=self.initial_balance)
        open_pos = None   # dict: {side, entry, qty, stop, take, conf, r, entry_time}

        for i in range(engine.lookback_warmup, len(df)):
            row = df.iloc[i]

            # Açık pozisyon stop/take kontrolü
            if open_pos:
                exit_price = None
                reason = None
                if open_pos["side"] == "long":
                    if row["low"] <= open_pos["stop"]:
                        exit_price = open_pos["stop"]; reason = "stop"
                    elif row["high"] >= open_pos["take"]:
                        exit_price = open_pos["take"]; reason = "take"
                else:
                    if row["high"] >= open_pos["stop"]:
                        exit_price = open_pos["stop"]; reason = "stop"
                    elif row["low"] <= open_pos["take"]:
                        exit_price = open_pos["take"]; reason = "take"
                if exit_price is not None:
                    if open_pos["side"] == "long":
                        pnl = (exit_price - open_pos["entry"]) * open_pos["qty"]
                    else:
                        pnl = (open_pos["entry"] - exit_price) * open_pos["qty"]
                    pnl -= open_pos["entry"] * open_pos["qty"] * self.fee_rate
                    balance += pnl

                    if open_pos["side"] == "long":
                        r = (exit_price - open_pos["entry"]) / (open_pos["entry"] - open_pos["stop"]) \
                            if open_pos["entry"] != open_pos["stop"] else 0.0
                    else:
                        r = (open_pos["entry"] - exit_price) / (open_pos["stop"] - open_pos["entry"]) \
                            if open_pos["entry"] != open_pos["stop"] else 0.0

                    result.trades.append(TradeRecord(
                        symbol=self.symbol, side=open_pos["side"],
                        entry_time=str(open_pos["entry_time"]), exit_time=str(row.name),
                        entry_price=open_pos["entry"], exit_price=exit_price,
                        pnl=pnl, pnl_pct=pnl / balance if balance else 0.0,
                        r_multiple=r,
                        stop_price=open_pos["stop"], take_price=open_pos["take"],
                        confidence=open_pos["conf"],
                    ))
                    open_pos = None

            # Yeni sinyal kontrolü (kapanmış mum)
            if open_pos or balance <= 0:
                continue

            window = df.iloc[: i + 1]
            decision = engine.evaluate(window, min_confidence)
            direction = decision["direction"]
            if direction == "none":
                continue

            price = float(row["close"])
            atr_params = self.cfg.get("indicators", {}).get("atr", {})
            atr_period = int(atr_params.get("period", 14))
            atr_col = f"atr_{atr_period}"
            atr = float(row[atr_col]) if atr_col in df.columns else price * 0.01

            profile = self.profile
            sizing = calculate_position_size(balance, price, atr, profile)
            st = calculate_stop_take(price, atr, direction,
                                     profile.stop_atr_mult, profile.take_atr_mult)
            qty = sizing["quantity"]
            if qty <= 0:
                continue
            open_pos = {
                "side": direction, "entry": price, "qty": qty,
                "stop": st["stop_price"], "take": st["take_price"],
                "conf": decision["confidence"]["best_score"],
                "entry_time": row.name,
            }

        result.final_balance = balance
        logger.info("Backtest bitti: %s -> %d işlem, getiri %.2f%%",
                    self.strategy_id, len(result.trades), result.total_return * 100)
        return result
    def run_grid(self, df: pd.DataFrame, param_grid: dict) -> list:
        """Parametre taraması (grid search).

        param_grid: {"rsi": {"oversold": [25, 30, 35]},
                     "entry": {"min_confidence_threshold": [60, 70, 80]}}
        Dönüş: her kombinasyon için summary dict'leri listesi.
        """
        import itertools
        from copy import deepcopy

        keys = list(param_grid.keys())
        combos = list(itertools.product(*param_grid.values()))
        results = []
        for combo in combos:
            cfg = deepcopy(self.cfg)
            for k, v in zip(keys, combo):
                if k == "entry":
                    cfg.setdefault("entry", {})["min_confidence_threshold"] = v
                else:
                    cfg.setdefault("indicators", {}).setdefault(k, {})[list(param_grid[k].keys())[0]] = v
            bt = Backtester(cfg, initial_balance=self.initial_balance, fee_rate=self.fee_rate)
            res = bt.run(df)
            results.append({"params": dict(zip(keys, combo)), **res.summary()})
        results.sort(key=lambda r: r["total_return"], reverse=True)
        return results