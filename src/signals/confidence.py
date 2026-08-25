"""Güven skoru hesaplama (0-100).

Confluence mantığı: aynı yönde oy veren indikatörlerin ağırlıkları
toplanır. Nötr oylar skoru etkilemez; ters oy verenler skoru düşürür
anlamı taşımaz (şartnamede ağırlık toplamı esaslıdır).

Ayrıca aktif modüllerin ağırlıkları, toplamın 1.0 etmesi için merkezi
normalize edilir (Bölüm 5.2).
"""


def normalize_weights(weights_by_enabled: dict) -> dict:
    """Aktif modüllerin ağırlıklarını toplam 1.0 olacak şekilde büyütür.

    Parametre: {"ema": 0.35, "rsi": 0.30, ...} (yalnızca enabled modüller)
    Dönüş: aynı anahtarlar, toplamı 1.0 olan normalize edilmiş ağırlıklar.
    """
    total = sum(weights_by_enabled.values())
    if total <= 0:
        return {}
    return {name: w / total for name, w in weights_by_enabled.items()}


def compute_confidence(votes: dict, normalized_weights: dict) -> dict:
    """Her yön (long/short) için güven skorunu hesaplar.

    votes: {"ema": "long", "rsi": "neutral", "volume_profile": "long"}
    normalized_weights: {"ema": 0.5, "rsi": 0.25, "volume_profile": 0.25}

    Dönüş: {"long": 75.0, "short": 0.0, "best_direction": "long", "best_score": 75.0}
    """
    scores = {"long": 0.0, "short": 0.0}
    for indicator, vote in votes.items():
        w = normalized_weights.get(indicator, 0.0)
        if vote == "long":
            scores["long"] += w
        elif vote == "short":
            scores["short"] += w

    result = {
        "long": scores["long"] * 100,
        "short": scores["short"] * 100,
    }
    if result["long"] >= result["short"]:
        result["best_direction"] = "long"
        result["best_score"] = result["long"]
    else:
        result["best_direction"] = "short"
        result["best_score"] = result["short"]
    return result