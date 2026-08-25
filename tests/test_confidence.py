"""Güven skoru ve ağırlık normalizasyonu birim testleri (Bölüm 5.2, 6.2)."""
from src.signals.confidence import normalize_weights, compute_confidence


class TestNormalizeWeights:
    def test_sum_to_one(self):
        w = normalize_weights({"ema": 0.35, "rsi": 0.30, "volume_profile": 0.35})
        assert abs(sum(w.values()) - 1.0) < 1e-9

    def test_renormalizes_after_removal(self):
        # Bir modül kapatılırsa kalanlar büyür (Bölüm 5.2)
        full = normalize_weights({"ema": 0.35, "rsi": 0.30})
        reduced = normalize_weights({"ema": 0.35})   # rsi kapatıldı
        assert reduced["ema"] > full["ema"]
        assert abs(reduced["ema"] - 1.0) < 1e-9

    def test_empty(self):
        assert normalize_weights({}) == {}


class TestComputeConfidence:
    def test_same_direction_sums_weights(self):
        w = normalize_weights({"ema": 0.35, "rsi": 0.30, "volume_profile": 0.35})
        votes = {"ema": "long", "rsi": "long", "volume_profile": "neutral"}
        res = compute_confidence(votes, w)
        assert res["best_direction"] == "long"
        assert abs(res["long"] - 65.0) < 1e-6

    def test_short_votes(self):
        w = normalize_weights({"ema": 0.5, "rsi": 0.5})
        res = compute_confidence({"ema": "short", "rsi": "short"}, w)
        assert res["best_direction"] == "short"
        assert res["short"] == 100.0

    def test_neutral_all(self):
        w = normalize_weights({"ema": 1.0})
        res = compute_confidence({"ema": "neutral"}, w)
        assert res["best_score"] == 0.0