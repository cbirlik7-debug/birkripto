"""EMA (Exponential Moving Average) indikatör modülü.

Kısa/uzun EMA çaprazlaması trend yönünü belirler:
- Kısa EMA > uzun EMA  -> LONG
- Kısa EMA < uzun EMA  -> SHORT

Config anahtarı: `ema`
"""
import pandas as pd

from .base import BaseIndicator
from .registry import register_indicator


@register_indicator
class EMAIndicator(BaseIndicator):
    name = "ema"

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        short_period = int(params.get("short_period", 9))
        long_period = int(params.get("long_period", 21))
        df[f"ema_{short_period}"] = df["close"].ewm(span=short_period, adjust=False).mean()
        df[f"ema_{long_period}"] = df["close"].ewm(span=long_period, adjust=False).mean()
        return df

    def vote(self, df: pd.DataFrame) -> str:
        if len(df) < 2:
            return "neutral"
        short_period = int(self._params.get("short_period", 9))
        long_period = int(self._params.get("long_period", 21))
        short_col = f"ema_{short_period}"
        long_col = f"ema_{long_period}"
        if short_col not in df.columns or long_col not in df.columns:
            return "neutral"
        last = df.iloc[-1]
        if last[short_col] > last[long_col]:
            return "long"
        if last[short_col] < last[long_col]:
            return "short"
        return "neutral"