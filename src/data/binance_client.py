"""Binance USDT-M Futures REST/WebSocket istemcisi (ccxt tabanlı).

- Geçmiş kline (mum) verisi çekme (backtest ve buffer doldurma için)
- Zaman dilimi / sembol doğrulama
- Public endpoint erişimi (kline verisi için API anahtarı şart değildir)
- Private (emir) yöntemleri: canlı mod için hazır iskelet
"""
import logging
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)


class BinanceClient:
    """Binance USDT-M Futures arayüzü."""

    def __init__(self, api_key: Optional[str] = None, api_secret: Optional[str] = None,
                 testnet: bool = False):
        self.api_key = api_key or ""
        self.api_secret = api_secret or ""
        self.testnet = testnet
        self._exchange = None
        self._init_exchange()

    def _init_exchange(self):
        """ccxt Binance (Futures) örneğini oluşturur."""
        import ccxt
        params = {
            "apiKey": self.api_key or None,
            "secret": self.api_secret or None,
            "enableRateLimit": True,
            "options": {"defaultType": "future"},
        }
        self._exchange = ccxt.binanceusdm(params)
        if self.testnet:
            self._exchange.set_sandbox_mode(True)

    @property
    def exchange(self):
        return self._exchange

    def fetch_klines(self, symbol: str, timeframe: str, limit: int = 500,
                     since_ms: Optional[int] = None) -> pd.DataFrame:
        """Geçmiş kline verisini OHLCV DataFrame olarak döndürür.

        Kolonlar: timestamp(UTC ms), open, high, low, close, volume
        """
        data = self.exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit, since=since_ms)
        df = pd.DataFrame(data, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df = df.set_index("timestamp")
        return df

    # --- Private (emir) yöntemleri: live broker için iskelet ---
    # Bu metotlar Faz 2'de doldurulacaktır (paper broker kullanırken çağrılmaz).

    def set_leverage(self, symbol: str, leverage: int):
        raise NotImplementedError("Live modda kullanılacak; paper modda çağrılmaz.")

    def create_order(self, **kwargs):
        raise NotImplementedError("Live modda emir gönderimi Faz 2 kapsamındadır.")

    def close_position(self, **kwargs):
        raise NotImplementedError("Live modda pozisyon kapatma Faz 2 kapsamındadır.")