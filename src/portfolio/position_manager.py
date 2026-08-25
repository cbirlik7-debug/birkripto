"""Açık pozisyonları takip etme ve PNL hesaplama.

Paper trading'de pozisyon durumu bellekte tutulur; kapanma sonrası
trade_logger'a aktarılır.
"""
import datetime as dt
import logging
import uuid
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class Position:
    position_id: str
    strategy_id: str
    symbol: str
    side: str                       # long | short
    quantity: float
    entry_price: float
    stop_price: Optional[float] = None
    take_price: Optional[float] = None
    leverage: int = 1
    confidence_score: float = 0.0
    fees_paid: float = 0.0
    opened_at: str = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc).isoformat())
    status: str = "open"            # open | closed
    exit_price: Optional[float] = None
    pnl: Optional[float] = None

    def unrealized_pnl(self, current_price: float) -> float:
        """Kaldıraç dâhil, kâr/zarar (vergi/komisyon hariç)."""
        if self.side == "long":
            return (current_price - self.entry_price) * self.quantity
        return (self.entry_price - current_price) * self.quantity

    def hit_stop(self, price: float) -> bool:
        if self.side == "long":
            return self.stop_price is not None and price <= self.stop_price
        return self.stop_price is not None and price >= self.stop_price

    def hit_take(self, price: float) -> bool:
        if self.side == "long":
            return self.take_price is not None and price >= self.take_price
        return self.take_price is not None and price <= self.take_price


class PositionManager:
    """Tüm açık pozisyonları ve PNL'yi yönetir."""

    def __init__(self, max_open_positions: int = 2):
        self.max_open_positions = max_open_positions
        self._positions: dict = {}   # position_id -> Position

    def can_open(self, strategy_id: str = None) -> bool:
        """Maks açık pozisyon sınırına ulaşılmadıysa True."""
        return len(self._positions) < self.max_open_positions

    def open_position(self, position: Position) -> Position:
        if not self.can_open():
            raise RuntimeError("Maksimum açık pozisyon sayısına ulaşıldı.")
        position.position_id = position.position_id or str(uuid.uuid4())
        self._positions[position.position_id] = position
        logger.info("Pozisyon açıldı: %s %s @%.2f", position.symbol, position.side, position.entry_price)
        return position

    def close_position(self, position_id: str, exit_price: float) -> Position:
        pos = self._positions.get(position_id)
        if pos is None:
            raise KeyError(f"Pozisyon bulunamadı: {position_id}")
        pos.exit_price = exit_price
        pos.pnl = pos.unrealized_pnl(exit_price)
        pos.status = "closed"
        self._positions.pop(position_id)
        logger.info("Pozisyon kapatıldı: %s PNL=%.4f", position_id, pos.pnl)
        return pos

    def all_open(self) -> list:
        return list(self._positions.values())

    def get(self, position_id: str) -> Optional[Position]:
        return self._positions.get(position_id)

    def total_unrealized(self, price_map: dict) -> float:
        """price_map: symbol->fiyat; tüm açık pozisyonların PNL toplamı."""
        total = 0.0
        for pos in self._positions.values():
            p = price_map.get(pos.symbol)
            if p is not None:
                total += pos.unrealized_pnl(p)
        return total