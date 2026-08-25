"""RSI (Relative Strength Index) indikatör modülü.

Aşırı satım/alım tespiti:
- RSI < oversold (varsayılan 30) -> LONG (dönüş beklentisi)
- RSI > overbought (varsayılan 70) -> SHORT
- Arada -> neutral

Config anahtarı: `rsi`
"""
import pandas as pd

from .base import BaseIndicator
from .registry import register_indicator


@register_indicator
class RSIIndicator(BaseIndicator):
    name = "rsi"

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        period = int(params.get("period", 14))
        delta = df["close"].diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)

        avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

        # Uç durumları güvenli işle: avg_loss=0 -> RSI 100, avg_gain=0 -> RSI 0
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        rsi = rsi.mask(avg_loss == 0, 100.0)
        rsi = rsi.mask(avg_gain == 0, 0.0)
        df[f"rsi_{period}"] = rsi
        return df

    def vote(self, df: pd.DataFrame) -> str:
        period = int(self._params.get("period", 14))
        oversold = float(self._params.get("oversold", 30))
        overbought = float(self._params.get("overbought", 70))
        col = f"rsi_{period}"
        if col not in df.columns:
            return "neutral"
        rsi = df.iloc[-1][col]
        if pd.isna(rsi):
            return "neutral"
        if rsi < oversold:
            return "long"
        if rsi > overbought:
            return "short"
        return "neutral"