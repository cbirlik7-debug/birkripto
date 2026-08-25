"""Live broker iskeleti (Faz 2 placeholder).

Gerçek emir gönderimi bu sınıfa eklenecektir. Arayüz `BaseBroker` ile
aynıdır; böylece kod tabanının geri kalanı değişmeden paper->live
geçişi sağlanır (Bölüm 11, Faz 2).
"""
import logging

from ..execution.registry import register_broker
from .base import BaseBroker, OrderRequest, OrderResult

logger = logging.getLogger(__name__)


@register_broker("live")
class LiveBroker(BaseBroker):
    """Gerçek emir gönderimi (henüz uygulanmadı — Faz 2)."""

    def __init__(self, api_key: str, api_secret: str, testnet: bool = False):
        self.api_key = api_key
        self.api_secret = api_secret
        self.testnet = testnet
        # BinanceClient burada init edilecek (Faz 2)

    async def open_position(self, req: OrderRequest) -> OrderResult:
        raise NotImplementedError("Live broker Faz 2'de uygulanacaktır.")

    async def close_position(self, order_id: str, exit_price: float) -> OrderResult:
        raise NotImplementedError("Live broker Faz 2'de uygulanacaktır.")

    async def get_balance(self) -> float:
        raise NotImplementedError("Live broker Faz 2'de uygulanacaktır.")

    async def get_open_positions(self) -> list:
        raise NotImplementedError("Live broker Faz 2'de uygulanacaktır.")