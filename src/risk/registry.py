"""Risk profili kayıt defteri (registry) ve ön tanımlı profiller.

Bu modül, config'den risk profil adı (low/medium/high) girildiğinde
ilgili varsayılan profili döndürür. Varsayılan değerler şartnamedeki
Bölüm 8 tablosuna karşılık gelir; config yüklenirken ezilebilir.
"""
from typing import Dict, Type, Union

from .base import BaseRiskProfile


def _make(name, **kw) -> BaseRiskProfile:
    return BaseRiskProfile(name=name, **kw)


_RISK_PROFILES: Dict[str, BaseRiskProfile] = {
    "low": _make(
        "low",
        min_confidence=80,
        position_pct=0.01,
        leverage=2,
        stop_atr_mult=1.0,
        take_atr_mult=1.5,
        max_open_positions=1,
        daily_loss_limit_pct=0.02,
    ),
    "medium": _make(
        "medium",
        min_confidence=70,
        position_pct=0.025,
        leverage=5,
        stop_atr_mult=1.5,
        take_atr_mult=2.5,
        max_open_positions=2,
        daily_loss_limit_pct=0.05,
    ),
    "high": _make(
        "high",
        min_confidence=60,
        position_pct=0.05,
        leverage=10,
        stop_atr_mult=2.0,
        take_atr_mult=4.0,
        max_open_positions=4,
        daily_loss_limit_pct=0.10,
    ),
}


def get_risk_profile(name: str) -> BaseRiskProfile:
    """Adla risk profilini döndürür (low/medium/high)."""
    if name not in _RISK_PROFILES:
        raise KeyError(f"Bilinmeyen risk profili: {name} (low|medium|high)")
    return _RISK_PROFILES[name]


def available_risk_profiles() -> list:
    return sorted(_RISK_PROFILES.keys())