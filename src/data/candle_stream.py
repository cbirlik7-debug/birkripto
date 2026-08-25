"""Canlı mum (kline) verisi toplama — Binance USDT-M Futures WebSocket.

- Kline akışı: `wss://fstream.binance.com/ws/<symbol>@kline_<interval>`
- Gelen veriler pandas DataFrame'e yazılır (son `buffer_size` mumluk pencereler)
- Bağlantı kopmalarında otomatik yeniden bağlanma (retry + exponential backoff)
- `asyncio` tabanlı ana döngüye uygun tasarım

Zaman damgaları UTC'dir (Binance UTC ms döner).
"""
import asyncio
import json
import logging
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

BINANCE_FUTURES_WS = "wss://fstream.binance.com/ws"


class CandleStream:
    """Belirli bir sembol/zaman dilimi için canlı mum akışını yönetir."""

    def __init__(self, symbol: str, timeframe: str = "5m",
                 buffer_size: int = 500,
                 reconnect_max_attempts: int = 5,
                 reconnect_base_delay: float = 1.0,
                 reconnect_max_delay: float = 30.0):
        self.symbol = symbol.upper()
        self.timeframe = timeframe
        self.buffer_size = buffer_size
        self.reconnect_max_attempts = reconnect_max_attempts
        self.reconnect_base_delay = reconnect_base_delay
        self.reconnect_max_delay = reconnect_max_delay

        # OHLCV hafızası: timestamp indeksli DataFrame
        self._df = pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
        self._last_kline_open_ms: Optional[int] = None
        self._on_new_candle_cb = None
        self._ws_url = f"{BINANCE_FUTURES_WS}/{self.symbol.lower()}@kline_{self.timeframe}"

    @property
    def df(self) -> pd.DataFrame:
        """İndikatör hesaplamaları için mevcut OHLCV DataFrame (son buffer_size mum)."""
        return self._df.tail(self.buffer_size).copy()

    def on_new_candle(self, callback):
        """Her yeni (kapanmış) mumda çağrılacak asenkron callback."""
        self._on_new_candle_cb = callback

    async def _update_candle(self, k):
        """Binance kline payload'ından OHLCV satırını günceller."""
        ts = int(k["k"]["t"])          # kline açılış zamanı (UTC ms)
        is_closed = k["k"]["x"]        # mum kapanmış mı?
        o = float(k["k"]["o"])
        h = float(k["k"]["h"])
        l = float(k["k"]["l"])
        c = float(k["k"]["c"])
        v = float(k["k"]["v"])

        new_row = pd.DataFrame(
            [[o, h, l, c, v]],
            index=[pd.to_datetime(ts, unit="ms", utc=True)],
            columns=["open", "high", "low", "close", "volume"],
        )

        if is_closed:  # kapanmış mum
            # kapanmış mum dataframe e eklenir
            if not self._df.empty and self._df.index[-1] == new_row.index[0]:
                self._df.iloc[-1] = new_row.iloc[0]
            else:
                self._df = pd.concat([self._df, new_row])
            self._df = self._df.tail(self.buffer_size)
            if self._on_new_candle_cb:
                await self._on_new_candle_cb(self.df)
        else:
            # açık (henüz kapanmamış) mum — son satırı güncelle
            if len(self._df) > 0:
                self._df.iloc[-1] = new_row.iloc[0] if self._df.index[-1] == new_row.index[0] else self._df.iloc[-1]

    async def _receive_loop(self):
        """WebSocket bağlantısını open/retry döngüsü içinde yönetir."""
        import websockets

        attempt = 0
        while True:
            try:
                async with websockets.connect(self._ws_url) as ws:
                    logger.info("WebSocket bağlandı: %s", self._ws_url)
                    attempt = 0
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        if "k" in msg:
                            await self._update_candle(msg)
            except (asyncio.CancelledError, KeyboardInterrupt):
                raise
            except Exception as exc:
                attempt += 1
                delay = min(self.reconnect_max_delay,
                            self.reconnect_base_delay * (2 ** (attempt - 1)))
                logger.warning(
                    "WebSocket hatası (%s). %d/%d deneme; %.1f sn sonra yeniden...",
                    exc, attempt, self.reconnect_max_attempts, delay,
                )
                if attempt >= self.reconnect_max_attempts:
                    logger.error("Bağlantı %d denemede kurulamadı; durduruluyor.", attempt)
                    raise
                await asyncio.sleep(delay)

    async def run(self):
        """Ana akışı başlatır (bloklayıcıdır; asyncio task olarak kullanılabilir)."""
        await self._receive_loop()

    async def preload(self, client, limit=500):
        """REST ile geçmiş veriyi önden yükleyip buffer'ı doldurur."""
        df = client.fetch_klines(self.symbol, self.timeframe, limit=limit)
        if not df.empty:
            self._df = df.tail(self.buffer_size)
            self._last_kline_ms = int(df.index[-1].timestamp() * 1000)
        logger.info("Preload tamam: %s %s -> %d mum", self.symbol, self.timeframe, len(self._df))