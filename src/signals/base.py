"""Sinyal kuralı taban sınıfı.

Bölüm 5.4'e göre sinyal kuralları da aynı arayüz+registry desenine uyar.
Sinyal kuralları konfluense ek koşullar ekler (ör. zaman filtresi, trend
filtresi). Varsayılan kurallar doğrudan indikatör oylarından türetilir;
bu modül, konfluens dışında ek/negatif filtre kuralları için bir genişletme
noktası sağlar.
"""
from abc import ABC, abstractmethod

import pandas as pd


class BaseSignalRule(ABC):
    """Tüm sinyal kuralları için ortak soyut taban sınıf."""

    name: str

    @abstractmethod
    def evaluate(self, df: pd.DataFrame, indicator_votes: dict) -> dict:
        """Kuralı değerlendirir ve sonucu dict olarak döndürür.

        Dönüş: {"allowed": bool, "reason": str, ...}
        """
        ...