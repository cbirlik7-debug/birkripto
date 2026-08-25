"""Sinyal motoru (Signal Engine) — Confluence mantığı.

Bu modül, birden fazla indikatörün aynı yönde uyuşmasını değerlendirir:
1. Yalnızca `enabled: true` olan ve registry'de kayıtlı indikatörler çalıştırılır
2. Aktif indikatör ağırlıkları toplamı 1.0 edecek şekilde normalize edilir
3. Her indikatör son mum için oy verir (long/short/neutral)
4. Güven skoru 0-100 arasında hesaplanır
5. ATR minimum volatilite kontrolü (yatay piyasa filtresi)
6. Eşik + diğer kurallara göre karar üretilir

Karar mantığı Bölüm 6.3: confidence >= eşik ise işlem açılabilir.
"""
import logging
from typing import Dict, List

import pandas as pd

from .confidence import compute_confidence, normalize_weights
from .registry import SIGNAL_RULE_REGISTRY

logger = logging.getLogger(__name__)


class SignalEngine:
    """Birden çok indikatörü config'e göre koordine eden sinyal motoru."""

    def __init__(self, indicator_configs: dict, rules: List[str] = None):
        """
        indicator_configs: Config'teki `indicators` bloğu.
            Ör: {"ema": {"enabled": true, "weight": 0.35, ...}, ...}
        rules: (opsiyonel) aktif sinyal kuralı adları listesi.
        """
        from ..indicators.registry import INDICATOR_REGISTRY
        self._INDICATOR_REGISTRY = INDICATOR_REGISTRY

        self.indicator_configs = indicator_configs
        self.active_indicators: Dict[str, dict] = {}
        for name, cfg in indicator_configs.items():
            if isinstance(cfg, dict) and cfg.get("enabled", True):
                self.active_indicators[name] = cfg

        raw_weights = {name: float(cfg.get("weight", 0.0)) for name, cfg in self.active_indicators.items()}
        self.weights = normalize_weights(raw_weights)
        self.rules = rules or []

        # İndikatörlerin hesaplanabilmesi için gereken minimum geçmiş (warmup)
        self.lookback_warmup = self._estimate_warmup(indicator_configs)

        logger.debug("Aktif indikatörler: %s", list(self.active_indicators.keys()))
        logger.debug("Normalize edilmiş ağırlıklar: %s", self.weights)
        logger.debug("Warmup: %d mum", self.lookback_warmup)

    @staticmethod
    def _estimate_warmup(indicator_configs: dict) -> int:
        """Periyot ayarlarından en uzun warmup'ı tahmin eder."""
        warmup = 50
        for name, cfg in indicator_configs.items():
            if not isinstance(cfg, dict):
                continue
            period = int(cfg.get("period") or cfg.get("lookback_periods") or 0)
            if name == "ema":
                period = int(cfg.get("long_period", 21))
            if period:
                warmup = max(warmup, int(period) + 5)
        return warmup

    def calculate_all(self, df: pd.DataFrame) -> pd.DataFrame:
        """Tüm aktif indikatörleri hesaplar; DataFrame'e kolon ekler."""
        for name, cfg in self.active_indicators.items():
            try:
                cls = self._INDICATOR_REGISTRY[name]
            except KeyError:
                logger.warning("İndikatör '%s' registry'de yok; atlanıyor.", name)
                continue
            instance = cls()
            instance.set_params(cfg)
            df = instance.calculate(df, cfg)
        return df

    def collect_votes(self, df: pd.DataFrame) -> Dict[str, str]:
        """Her aktif indikatörün son oyunu toplar: {"ema": "long", ...}."""
        votes: Dict[str, str] = {}

        # Önce tüm indikatörler hesaplanır (DataFrame'e kolon/attr eklenir)
        df = self.calculate_all(df)

        for name, cfg in self.active_indicators.items():
            try:
                cls = self._INDICATOR_REGISTRY[name]
            except KeyError:
                continue
            instance = cls()
            instance.set_params(cfg)
            votes[name] = instance.vote(df)

        return votes

    def evaluate(self, df: pd.DataFrame, min_confidence: float) -> dict:
        """
        Sinyali değerlendirir ve karar dict'i döndürür.

        Dönüş: {
            "signal": "long" | "short" | "none",
            "confidence": {"long": ..., "short": ..., "best_direction": ..., "best_score": ...},
            "votes": {"ema": "long", ...},
            "weights": {...},
            "min_volatility_ok": bool,
            "rules_applied": [...],
            "decision_reasons": [...],
        }
        """
        votes = self.collect_votes(df)
        conf = compute_confidence(votes, self.weights)

        # ATR volatilite kontrolü
        atr_cfg = self.indicator_configs.get("atr") or {}
        min_vol_ok = True
        if atr_cfg.get("enabled", False):
            atr_cls = self._INDICATOR_REGISTRY.get("atr")
            if atr_cls:
                inst = atr_cls()
                inst.set_params(atr_cfg)
                inst.calculate(df, atr_cfg)
                min_vol_ok = inst.min_volatility_ok(df, atr_cfg)

        decision_reasons = []

        # Sinyal kurallarını uygula (ör. zaman filtresi) — isteğe bağlı
        rules_applied = []
        rules_block = False
        for rule_name in self.rules:
            try:
                rule_cls = SIGNAL_RULE_REGISTRY[rule_name]
            except KeyError:
                continue
            rule = rule_cls()
            res = rule.evaluate(df, votes)
            rules_applied.append({"rule": rule_name, **res})
            if not res.get("allowed", True):
                rules_block = True
                decision_reasons.append(f"kural-engeli: {rule_name} -> {res.get('reason', '')}")

        direction = "none"
        if min_vol_ok and conf["best_score"] >= min_confidence and not rules_block:
            direction = conf["best_direction"]
            decision_reasons.append(
                f"confidence={conf['best_score']:.1f} >= eşik={min_confidence}"
            )
        elif not min_vol_ok:
            decision_reasons.append("düşük volatilite — sinyal üretilmedi (ATR filtresi)")
        elif conf["best_score"] < min_confidence:
            decision_reasons.append(
                f"confidence={conf['best_score']:.1f} < eşik={min_confidence} — sinyal üretilmedi"
            )
        elif conf["best_score"] < price_confidence:
            decision_reasons.append(
                f"confidence={conf['best_score']:.1f} < eşik={price_confidence} — sinyal üretilmedi"
            )

        return {
            "direction": direction,
            "confidence": conf,
            "votes": votes,
            "weights": self.weights,
            "min_volatility_ok": min_vol_ok,
            "rules_applied": rules_applied,
            "decision_reasons": decision_reasons,
        }