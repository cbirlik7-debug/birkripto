"""Mevcut piyasa durumunun özetini çıkarır (LLM danışmana girdi).

`strategy_advisor` canlı işleme müdahale etmez; yalnızca okuma amaçlı
piyasa özeti üretmek bu modülün görevidir. Binance REST public
endpoint'lerden güncel fiyat/volatilite/trend/hacim bilgisi toplar ve
istatistiksel bir özet döndürür.
"""
import logging

import pandas as pd

from ..data.binance_client import BinanceClient

logger = logging.getLogger(__name__)


class MarketSnapshot:
    """Sembol için anlık piyasa özeti üretir."""

    def __init__(self, client: BinanceClient = None):
        self.client = client or BinanceClient()

    def build(self, symbol: str, timeframe: str = "15m", lookback: int = 200) -> dict:
        """Sembole ait güncel piyasa özetini döndürür (dict/str).

        Dönüş alanları: son fiyat, son zaman dilimi değişimi, volatilite
        (ATR), 24s hacim, EMA trend yönü, RSI gibi ham istatistikler.
        """
        df = self.client.fetch_klines(symbol, timeframe, limit=lookback)
        if df.empty:
            return {"symbol": symbol, "error": "veri alınamadı"}

        close = df["close"]
        last_price = float(close.iloc[-1])
        period_change_pct = (float(close.iloc[-1]) / float(close.iloc[0]) - 1) * 100

        # Volatilite: son 20 mumluk ATR (basit hesaplama)
        high, low, prev_close = df["high"], df["low"], close.shift(1)
        tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
        atr = float(tr.tail(20).mean()) if len(tr) >= 20 else float(tr.mean())

        # Trend yönü: EMA9/EMA21
        ema9 = float(close.ewm(span=9, adjust=False).mean().iloc[-1])
        ema21 = float(close.ewm(span=21, adjust=False).mean().iloc[-1])
        trend = "up" if ema9 > ema21 else "down"

        # RSI14 (basit)
        delta = close.diff()
        gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
        loss = -delta.clip(upper=0).ewm(alpha=1 / 14, adjust=False).mean()
        rs = gain / loss.replace(0, float("nan"))
        rsi = float((100 - 100 / (1 + rs)).iloc[-1]) if loss.iloc[-1] > 0 else 50.0

        # Hacim
        avg_volume = float(df["volume"].tail(24).mean())

        summary = {
            "symbol": symbol,
            "timeframe": timeframe,
            "last_price": round(last_price, 6),
            "period_change_pct": round(period_change_pct, 3),
            "atr": round(atr, 6),
            "volatility_pct": round(atr / last_price * 100, 4) if last_price else 0.0,
            "trend_ema": trend,
            "rsi": round(rsi, 2),
            "avg_24_volume": round(avg_volume, 2),
            "candles_used": len(df),
        }
        return summary

    def to_text(self, symbol: str, timeframe: str = "15m") -> str:
        """LLM'e gönderilecek metin özetini üretir."""
        s = self.build(symbol, timeframe)
        if "error" in s:
            return f"{symbol}: {s['error']}"
        return (
            f"[Piyasa Özeti] {symbol} ({s['timeframe']})\n"
            f"- Son fiyat: {s['last_price']}\n"
            f"- Son dönem değişim: %{s['period_change_pct']}\n"
            f"- Volatilite (ATR): {s['atr']} (%{s['volatility_pct']})\n"
            f"- Trend (EMA9/21): {s['trend_ema']}\n"
            f"- RSI(14): {s['rsi']}\n"
            f"- Ort. 24 mum hacmi: {s['avg_24_volume']}\n"
        )