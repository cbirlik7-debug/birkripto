"""ATR (Average True Range) indikatör modülü.

Volatilite ölçümü: stop-loss / take-profit mesafeleri ve pozisyon
büyüklüğü hesaplamalarında, ayrıca minimum volatilite eşiği (yatay
piyasa filtresi) için kullanılır. ATR doğrudan yön oyu vermez.

Config anahtarı: `atr`
"""
import pandas as pd

from .base import BaseIndicator
from .registry import register_indicator


@register_indicator
class ATRIndicator(BaseIndicator):
    name = "atr"

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        period = int(params.get("period", 14))
        high = df["high"]
        low = df["low"]
        close = df["close"]
        prev_close = close.shift(1)

        tr = pd.concat(
            [
                high - low,
                (high - prev_close).abs(),
                (low - prev_close).abs(),
            ],
            axis=1,
        ).max(axis=1)

        df[f"atr_{period}"] = tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
        return df

    def vote(self, df: pd.DataFrame) -> str:
        """ATR yön sinyali vermez, her zaman neutral döner.

        Ancak minimum volatilite eşiği kontrolü sinyal motorunda ATR
        değeri alınarak yapılır (sinyal_engine içinde).
        """
        return "neutral"

    def min_volatility_ok(self, df: pd.DataFrame, params: dict) -> bool:
        """Son kapanış fiyatına göre ATR/min_volatility_mult eşiği.

        parameters: atr_period (int), min_volatility_mult (float, ör. 0.0005)
        """
        period = int(params.get("atr_period", params.get("period", 14)))
        mult = float(params.get("min_volatility_mult", 0.0005))
        col = f"atr_{period}"
        if col not in df.columns or len(df) == 0:
            return False
        last = df.iloc[-1]
        atr = last[col]
        price = last["close"]
        if pd.isna(atr) or price <= 0:
            return False
        return (atr / price) >= mult