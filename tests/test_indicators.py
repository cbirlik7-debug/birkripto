"""İndikatör modülleri birim testleri (Bölüm 17 — TradingView toleransı)."""
import numpy as np
import pandas as pd
import pytest

from src.indicators.registry import INDICATOR_REGISTRY, available_indicators
from src.indicators.ema import EMAIndicator
from src.indicators.rsi import RSIIndicator
from src.indicators.atr import ATRIndicator
from src.indicators.volume_profile import VolumeProfileIndicator
from tests.conftest import make_ohlcv


class TestRegistry:
    def test_all_indicators_registered(self):
        assert available_indicators() == ["atr", "ema", "rsi", "volume_profile"]
        for name in INDICATOR_REGISTRY:
            assert hasattr(INDICATOR_REGISTRY[name], "calculate")
            assert hasattr(INDICATOR_REGISTRY[name], "vote")


class TestEMA:
    def test_calculate_adds_columns(self, ohlcv):
        df = EMAIndicator().calculate(ohlcv, {"short_period": 9, "long_period": 21})
        assert "ema_9" in df.columns and "ema_21" in df.columns

    def test_ema_rising_trend_long_vote(self):
        # Yükselen seride kısa EMA uzun EMA'nın üstünde olmalı
        close = np.linspace(100, 200, 60) + np.random.RandomState(1).normal(0, 0.2, 60)
        df = make_ohlcv(60, seed=1)
        df["close"] = close
        ind = EMAIndicator()
        ind.set_params({"short_period": 9, "long_period": 21})
        df = ind.calculate(df, {"short_period": 9, "long_period": 21})
        assert ind.vote(df) == "long"


class TestRSI:
    def test_oversold_long_vote(self):
        # Kesintisiz güçlü düşüş: ortalama kayıp >> ortalama kazanç -> RSI düşük
        close = 100 - np.arange(60) * 1.5
        df = make_ohlcv(60, seed=2)
        df["close"] = close.copy()
        ind = RSIIndicator()
        ind.set_params({"period": 14, "oversold": 30, "overbought": 70})
        df = ind.calculate(df, {"period": 14})
        rsi_val = float(df["rsi_14"].iloc[-1])
        assert rsi_val < 30, f"RSI={rsi_val} 30 altında olmalıydı"
        assert ind.vote(df) == "long"

    def test_overbought_short_vote(self):
        # Kesintisiz güçlü yükseliş: ortalama kazanç >> ortalama kayıp -> RSI yüksek
        close = 50 + np.arange(60) * 2.0
        df = make_ohlcv(60, seed=2)
        df["close"] = close.copy()
        ind = RSIIndicator()
        ind.set_params({"period": 14, "oversold": 30, "overbought": 70})
        df = ind.calculate(df, {"period": 14})
        rsi_val = float(df["rsi_14"].iloc[-1])
        assert rsi_val > 70, f"RSI={rsi_val} 70 üzerinde olmalıydı"
        assert ind.vote(df) == "short"


class TestATR:
    def test_calculate_adds_column(self, ohlcv):
        df = ATRIndicator().calculate(ohlcv, {"period": 14})
        assert "atr_14" in df.columns
        assert df["atr_14"].dropna().iloc[-1] > 0

    def test_atr_neutral_vote(self, ohlcv):
        ind = ATRIndicator()
        ind.set_params({"period": 14})
        assert ind.vote(ohlcv) == "neutral"


class TestVolumeProfile:
    def test_profile_attrs(self, ohlcv):
        df = VolumeProfileIndicator().calculate(ohlcv, {"lookback_periods": 100})
        profile = df.attrs.get("volume_profile")
        assert profile is not None
        assert profile["va_low"] <= profile["poc"] <= profile["va_high"]

    def test_vote_never_crashes(self, ohlcv):
        ind = VolumeProfileIndicator()
        ind.set_params({"lookback_periods": 100})
        assert ind.vote(ohlcv) in ("long", "short", "neutral")