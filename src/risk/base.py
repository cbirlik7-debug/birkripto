"""Risk profili taban sınıfı.

Risk profilleri (low/medium/high), pozisyon büyüklüğü, kaldıraç, stop/take
çarpanları, eşik ve günlük kayıp limiti gibi parametreleri taşır.
Config'ten okunan bir profili programatik bir nesneye dönüştürür.
"""
from dataclasses import dataclass, field


@dataclass
class BaseRiskProfile:
    """Ortak risk profil veri şeması. Risk_adı profildeki anahtardır."""

    name: str                          # low | medium | high
    min_confidence: float = 70.0       # güven skoru giriş eşiği
    position_pct: float = 0.025        # bakiyenin yüzdesi (0.025 = %2.5)
    leverage: int = 5
    stop_atr_mult: float = 1.5
    take_atr_mult: float = 2.5
    max_open_positions: int = 2
    daily_loss_limit_pct: float = 0.05  # bakiye yüzdesi

    def profile_param(self) -> dict:
        """dict dönüşümü (loglama/config için)."""
        return {
            "name": self.name,
            "min_confidence": self.min_confidence,
            "position_pct": self.position_pct,
            "leverage": self.leverage,
            "stop_atr_mult": self.stop_atr_mult,
            "take_atr_mult": self.take_atr_mult,
            "max_open_positions": self.max_open_positions,
            "daily_loss_limit_pct": self.daily_loss_limit_pct,
        }