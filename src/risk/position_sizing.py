"""Pozisyon büyüklüğü hesaplama (Bölüm 10).

Sabit risk yüzdesi yaklaşımı:
- Risk profili bakiye %'sini belirler (ör. low -> %1)
- ATR bazlı stop mesafesine göre normalize edilir:
  volatilite arttıkça pozisyon küçülür.

Formül:
  account_risk = account_balance * position_pct
  stop_distance = stop_atr_mult * ATR
  position_size (USDT) = account_risk / (stop_distance / price)
  quantity = position_size / price
"""
from dataclasses import dataclass

from ..risk.base import BaseRiskProfile


def calculate_position_size(
    balance: float,
    price: float,
    atr_value: float,
    profile: "BaseRiskProfile",
) -> dict:
    """Pozisyon büyüklüğünü USDT ve varlık adedi olarak hesaplar."""
    if price <= 0 or balance <= 0:
        return {"quantity": 0.0, "position_size_usdt": 0.0}

    stop_distance_price = profile.stop_atr_mult * atr_value
    if stop_distance_price <= 0:
        # Stop mesafesi hesaplanamıyorsa ATR'siz temel oran
        position_size_usdt = balance * profile.position_pct
    else:
        # Sabit risk: bakiye %'si kadar zarar toleransı olacak şekilde büyüklük
        risk_amount = balance * profile.position_pct
        position_size_usdt = risk_amount * (price / stop_distance_price)

    # Kaldıraç marjinal etkisi: kullanılan marj, pozisyonun kaldıraçla bölünmüş hali
    margin_usdt = position_size_usdt / profile.leverage
    quantity = position_size_usdt / price

    return {
        "quantity": quantity,
        "position_size_usdt": position_size_usdt,
        "margin_usdt": margin_usdt,
        "leverage": profile.leverage,
    }