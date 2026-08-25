"""Execution (broker) taban sınıfı.

Paper ve live broker'lar aynı arayüzü uygular (Bölüm 11 — Faz 2'de
live_ağ geçişi bu arayüz sayesinde geri kalan kodu değiştirmeden olur).
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class OrderRequest:
    symbol: str
    side: str                      # long | short
    quantity: float                # varlık miktarı (USDT büyüklüğünden türetilir)
    entry_price: float
    stop_price: Optional[float] = None
    take_price: Optional[float] = None
    leverage: int = 1
    strategy_id: str = ""
    confidence_score: float = 0.0


@dataclass
class OrderResult:
    order_id: str
    symbol: str
    side: str
    quantity: float
    entry_price: float
    status: str                     # opened | closed | rejected
    exit_price: Optional[float] = None
    stop_price: Optional[float] = None
    take_price: Optional[float] = None
    fee: float = 0.0
    meta: dict = None

    def __post_init__(self):
        if self.meta is None:
            self.meta = {}


class BaseBroker(ABC):
    """Broker arayüzü: paper ve live uygulamalar bu soyutlamayı doldurur."""

    @abstractmethod
    async def open_position(self, req: OrderRequest) -> OrderResult:
        ...

    @abstractmethod
    async def close_position(self, order_id: str, exit_price: float) -> OrderResult:
        ...

    @abstractmethod
    async def get_balance(self) -> float:
        """Kullanılabilir bakiye (USDT)."""
        ...

    @abstractmethod
    async def get_open_positions(self) -> list:
        """Açık pozisyonlar listesi (OrderResult benzeri)."""
        ...