"""Paper trading broker — simüle emir yürütme (Bölüm 5.4, 11).

- Sanal bakiye ile başlar (config'ten, ör. $10,000)
- Slippage ve komisyon simülasyonu (taker/maker fee).
- Sinyal geldiğinde "sanki gerçek emir gönderiliyormuş gibi" işlem açılır.
- Açık pozisyonlar PositionManager'dadır; kapanma sonrası trade_logger'a yazılır.

Live (Faz 2) ile aynı arayüzü (BaseBroker) uygular.
"""
import logging
import uuid

from ..execution.base import BaseBroker, OrderRequest, OrderResult
from ..execution.registry import register_broker

logger = logging.getLogger(__name__)


@register_broker("paper")
class PaperBroker(BaseBroker):
    """Kağıt üzerinde (simüle) emir yürütme.

    Kullanım: broker = PaperBroker(starting_balance=10000, taker_fee=0.0004)
    """

    def __init__(self, starting_balance: float, taker_fee: float = 0.0004,
                 maker_fee: float = 0.0002, slippage_bps: float = 2.0):
        self.balance = starting_balance
        self.taker_fee = taker_fee
        self.maker_fee = maker_fee
        self.slippage_bps = slippage_bps
        self._open_positions: dict = {}   # order_id -> dict
        self._history: list = []

    def _apply_slippage(self, price: float, side: str) -> float:
        """Slipaji fiyata yansıtır: long girişte biraz üst, short'ta biraz alt."""
        slip = price * (self.slippage_bps / 10000.0)
        return price + slip if side == "long" else price - slip

    async def open_position(self, req: OrderRequest) -> OrderResult:
        exec_price = self._apply_slippage(req.entry_price, req.side)
        notional = exec_price * req.quantity
        fee = notional * self.taker_fee
        if notional + fee > self.balance:
            return OrderResult(
                order_id="", symbol=req.symbol, side=req.side, quantity=req.quantity,
                entry_price=req.entry_price, status="rejected",
                meta={"reason": "yetersiz bakiye", "paper": True},
            )
        self.balance -= fee
        order_id = f"paper-{uuid.uuid4().hex[:8]}"
        self._open_positions[order_id] = {
            "strategy_id": req.strategy_id,
            "symbol": req.symbol,
            "side": req.side,
            "quantity": req.quantity,
            "entry_price": exec_price,
            "stop_price": req.stop_price,
            "take_price": req.take_price,
            "confidence_score": req.confidence_score,
        }
        logger.info("Paper işlem açıldı: %s %s %.6f @ %.2f (slippage uygulandı)",
                    req.symbol, req.side, req.quantity, exec_price)
        return OrderResult(
            order_id=order_id, symbol=req.symbol, side=req.side, quantity=req.quantity,
            entry_price=exec_price, stop_price=req.stop_price, take_price=req.take_price,
            status="opened", fee=fee,
            meta={"paper": True, "strategy_id": req.strategy_id},
        )

    async def close_position(self, order_id: str, exit_price: float) -> OrderResult:
        order = self._open_positions.get(order_id)
        if not order:
            return OrderResult(order_id=order_id, symbol="", side="",
                               quantity=0, entry_price=exit_price, status="rejected",
                               meta={"error": "pozisyon bulunamadı", "paper": True})
        exec_price = self._apply_slippage(exit_price, order["side"])
        notional = exec_price * order["quantity"]
        fee = notional * self.taker_fee
        self.balance -= fee
        if order["side"] == "long":
            pnl = (exec_price - order["entry_price"]) * order["quantity"]
        else:
            pnl = (order["entry_price"] - exec_price) * order["quantity"]
        pnl -= fee
        self.balance += pnl
        self._open_positions.pop(order_id)
        logger.info("Paper işlem kapandı: %s PNL=%.2f bakiye=%.2f", order_id, pnl, self.balance)
        return OrderResult(order_id=order_id, symbol=order["symbol"], side=order["side"],
                           quantity=order["quantity"], entry_price=order["entry_price"],
                           exit_price=exec_price, status="closed", fee=fee,
                           meta={"paper": True, "pnl": pnl, "strategy_id": order["strategy_id"]})

    async def get_balance(self) -> float:
        return self.balance

    async def get_open_positions(self) -> list:
        return list(self._open_positions.values())