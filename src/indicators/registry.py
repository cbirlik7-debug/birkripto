"""İndikatör kayıt defteri (registry).

Yeni bir indikatör eklemek için: yeni bir dosya (ör. macd.py) oluşturun,
`BaseIndicator`'ı miras alın ve sınıfı `@register_indicator` ile işaretleyin.
Modül, `src/indicators` paketi import edildiğinde otomatik kayıt olur.
"""
from typing import Dict, Type

from .base import BaseIndicator

INDICATOR_REGISTRY: Dict[str, Type[BaseIndicator]] = {}


def register_indicator(cls):
    """Bir indikatör sınıfını kaydeder.

    Kullanım: `@register_indicator` sınıf dekoratörü olarak.
    """
    INDICATOR_REGISTRY[cls.name] = cls
    return cls


def get_indicator(name: str) -> Type[BaseIndicator]:
    """Kayıtlı indikatör sınıfını döndürür."""
    if name not in INDICATOR_REGISTRY:
        raise KeyError(f"indikatör kayıtlı değil: {name}")
    return INDICATOR_REGISTRY[name]


def available_indicators() -> list:
    """Tüm kayıtlı indikatör adlarını listeler."""
    return sorted(INDICATOR_REGISTRY.keys())