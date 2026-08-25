"""İndikatör taban sınıfı ve kayıt (registry) mantığı.

Bölüm 5.1'deki ortak arayüz prensibine göre, her indikatör modülü
`BaseIndicator`'ı miras alır, `calculate` ve `vote` metodlarını
uygular ve `@register_indicator` dekoratörüyle registry'ye eklenir.
"""
from abc import ABC, abstractmethod
from typing import Dict

import pandas as pd

# 'long' | 'short' | 'neutral'
Vote = str


class BaseIndicator(ABC):
    """Tüm indikatörler için ortak soyut taban sınıf."""

    name: str          # config.yaml'daki anahtarla eşleşir, ör. "ema"
    weight: float      # confluence ağırlığı (varsayılan; config ezebilir)

    def __init__(self, **_kwargs):
        # Herhangi bir indikatör isteğe bağlı kendi parametre setini alabilir.
        self._params: dict = {}

    @abstractmethod
    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        """OHLCV DataFrame'e indikatör kolonlarını ekler ve aynı DataFrame'i döndürür."""
        ...

    @abstractmethod
    def vote(self, df: pd.DataFrame) -> str:
        """Son mum için 'long' | 'short' | 'neutral' oy döner."""
        ...

    def set_params(self, params: dict) -> None:
        """Config'ten gelen parametreleri modüle bağlar."""
        self._params = params or {}