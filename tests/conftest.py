"""pytest ortak ayarları: proje kökünü sys.path'e ekler + test yardımcıları."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def make_ohlcv(n: int = 300, seed: int = 7, trend: float = 0.0, start: str = "2026-01-01",
               freq: str = "15min") -> pd.DataFrame:
    """Yönlü (trend) veya rastgele sentetik OHLCV üretir."""
    rng = np.random.default_rng(seed)
    drift = np.full(n, trend)
    rets = drift + rng.normal(0, 1, n) * 2
    close = 100 + np.cumsum(rets)
    high = close + np.abs(rng.normal(0, 0.4, n))
    low = close - np.abs(rng.normal(0, 0.4, n))
    vol = rng.uniform(50, 150, n)
    idx = pd.date_range(start, periods=n, freq=freq, tz="UTC")
    return pd.DataFrame({"open": close, "high": high, "low": low, "close": close, "volume": vol},
                        index=idx)


@pytest.fixture
def ohlcv() -> pd.DataFrame:
    return make_ohlcv()


@pytest.fixture
def trending_ohlcv() -> pd.DataFrame:
    """Belirgin yükseliş trendi — EMA/RSI uyuşumunu tetiklemesi kolay."""
    return make_ohlcv(n=400, seed=3, trend=0.9)