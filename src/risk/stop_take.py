"""Stop-loss / take-profit hesaplama (Bölüm 10).

ATR çarpanlarıyla dinamik seviyeler hesaplanır (sabit yüzde değil).

- stop_price = entry ∓ stop_atr_mult * ATR
- take_price = entry ± take_atr_mult * ATR
- R:R = take_atr_mult / stop_atr_mult

Long pozisyonda stop girişin altında, take üstündedir;
Short'ta bunun tersi geçerlidir.
"""


def calculate_stop_take(entry_price: float, atr_value: float, side: str,
                        stop_atr_mult: float, take_atr_mult: float) -> dict:
    """Giriş fiyatına, ATR'ye ve çarpanlara göre stop/take seviyelerini döndürür."""
    stop_distance = stop_atr_mult * atr_value
    take_distance = take_atr_mult * atr_value

    if side == "long":
        stop_price = entry_price - stop_distance
        take_price = entry_price + take_distance
    elif side == "short":
        stop_price = entry_price + stop_distance
        take_price = entry_price - take_distance
    else:
        raise ValueError(f"Bilinmeyen yön: {side} (long|short)")

    risk_reward = (take_atr_mult / stop_atr_mult) if stop_atr_mult > 0 else 0.0

    return {
        "stop_price": stop_price,
        "take_price": take_price,
        "stop_distance_pct": stop_distance / entry_price if entry_price else 0.0,
        "take_distance_pct": take_distance / entry_price if entry_price else 0.0,
        "risk_reward_ratio": risk_reward,
    }