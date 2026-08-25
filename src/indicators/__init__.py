"""İndikatör modülleri paketi.

Bu paket import edildiğinde tüm indikatör modülleri otomatik olarak
registry'ye kaydedilir (bkz. `indicators.registry.INDICATOR_REGISTRY`).
"""
from .base import BaseIndicator, Vote
from . import ema, rsi, atr, volume_profile  # noqa: F401  (kayıt yan etkisi)