"""Volume Profile indikatör modülü.

Belirli bir fiyat aralığındaki işlem hacmi yoğunluğu: destek/direnç
tespiti için POC (Point of Control) ve Value Area (VA) hesaplanır.

Oy mantığı:
- Fiyat, Value Area'nın altındaysa ve yukarı dönüyorsa   -> LONG desteği
- Fiyat, Value Area'nın üstündeyse ve aşağı dönüyorsa    -> SHORT desteği
- Aksi halde neutral

Config anahtarı: `volume_profile`
"""
from typing import Optional

import numpy as np
import pandas as pd

from .base import BaseIndicator
from .registry import register_indicator

# Value Area yüzdesi (ortalama hacmin toplandığı fiyat aralığı)
VA_PERCENT = 0.70


@register_indicator
class VolumeProfileIndicator(BaseIndicator):
    name = "volume_profile"

    def _build_profile(self, df: pd.DataFrame, bins: int = 50) -> Optional[dict]:
        """Fiyat-bölge bazlı hacim dağılımı; POC ve VA dict'i döner."""
        lookback = int(self._params.get("lookback_periods",
                                        self._current_params.get("lookback_periods", 100)))
        window = df.tail(lookback)
        bins = int(self._params.get("bins", bins))
        if window.empty:
            return None

        price_lo = window["low"].min()
        price_hi = window["high"].max()
        if price_lo == price_hi or not np.isfinite(price_lo) or not np.isfinite(price_hi):
            return None

        # Her mumun hacmini fiyat aralığına dağıt (tsa yerleşimi).
        step = (price_hi - price_lo) / bins
        if step <= 0:
            return None

        volume_per_bin = np.zeros(bins)
        for lo, hi, vol in zip(window["low"], window["high"], window["volume"]):
            if vol is None or np.isnan(vol):
                continue
            lo_idx = int((lo - price_lo) / step)
            hi_idx = int((hi - price_lo) / step)
            lo_idx = max(0, min(bins - 1, lo_idx))
            hi_idx = max(0, min(bins - 1, hi_idx))
            span = max(1, hi_idx - lo_idx + 1)
            per_share = vol / span
            for i in range(lo_idx, hi_idx + 1):
                volume_per_bin[i] += per_share

        poc_idx = int(np.argmax(volume_per_bin))
        poc_price = price_lo + (poc_idx + 0.5) * step

        # Value Area: POC'tan başlayarak %70 toplam hacmi kapsayan bölge.
        total_vol = volume_per_bin.sum()
        target = total_vol * VA_PERCENT
        acc = volume_per_bin[poc_idx]
        lo_idx = poc_idx
        hi_idx = poc_idx
        while acc < target:
            left_vol = volume_per_bin[lo_idx - 1] if lo_idx > 0 else -1
            right_vol = volume_per_bin[hi_idx + 1] if hi_idx < bins - 1 else -1
            if left_vol < 0 and right_vol < 0:
                break
            if left_vol >= right_vol:
                lo_idx -= 1
                acc += volume_per_bin[lo_idx]
            else:
                hi_idx += 1
                acc += volume_per_bin[hi_idx]

        va_high = price_lo + (hi_idx + 0.5) * step
        va_low = price_lo + (lo_idx + 0.5) * step
        return {
            "poc": float(poc_price),
            "va_high": float(va_high),
            "va_low": float(va_low),
        }

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._current_params = {}

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        self._current_params = params or {}
        profile = self._build_profile(df)
        if profile:
            df.attrs["volume_profile"] = profile
        return df

    def vote(self, df: pd.DataFrame) -> str:
        profile = df.attrs.get("volume_profile")
        if not profile:
            return "neutral"
        last = df.iloc[-1]
        price = last["close"]
        va_low = profile["va_low"]
        va_high = profile["va_high"]

        if len(df) >= 2:
            prev = df.iloc[-2]["close"]
            moving_up = last["close"] > prev
            moving_down = last["close"] < prev
        else:
            moving_up = moving_down = False

        if price < va_low and moving_up:
            return "long"
        if price > va_high and moving_down:
            return "short"
        return "neutral"