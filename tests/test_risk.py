"""Risk katmanı birim testleri (pozisyon büyüklüğü, stop/take, circuit breaker)."""
import pytest

from src.risk.registry import get_risk_profile, available_risk_profiles
from src.risk.position_sizing import calculate_position_size
from src.risk.stop_take import calculate_stop_take
from src.risk.circuit_breaker import CircuitBreaker


class TestRiskProfiles:
    def test_available(self):
        assert available_risk_profiles() == ["high", "low", "medium"]

    def test_low_profile_values(self):
        p = get_risk_profile("low")
        assert p.min_confidence == 80
        assert p.position_pct == 0.01
        assert p.leverage == 2
        assert p.stop_atr_mult == 1.0
        assert p.max_open_positions == 1

    def test_unknown_raises(self):
        try:
            get_risk_profile("luna")
        except KeyError:
            return
        raise AssertionError("KeyError bekleniyordu")


class TestPositionSizing:
    def test_high_volatility_smaller_position(self):
        p = get_risk_profile("medium")
        bal, price = 10000, 100.0
        size_low_atr = calculate_position_size(bal, price, atr_value=1.0, profile=p)
        size_high_atr = calculate_position_size(bal, price, atr_value=5.0, profile=p)
        # Volatilite arttıkça pozisyon küçülür (Bölüm 10)
        assert size_high_atr["quantity"] < size_low_atr["quantity"]

    def test_zero_price(self):
        p = get_risk_profile("low")
        assert calculate_position_size(10000, 0.0, 1.0, p)["quantity"] == 0.0


class TestStopTake:
    def test_long_levels(self):
        st = calculate_stop_take(100, atr_value=2, side="long", stop_atr_mult=1.5, take_atr_mult=2.5)
        assert st["stop_price"] == 100 - 3
        assert st["take_price"] == 100 + 5
        assert st["risk_reward_ratio"] == pytest.approx(2.5 / 1.5)

    def test_short_levels(self):
        st = calculate_stop_take(100, atr_value=2, side="short", stop_atr_mult=1.5, take_atr_mult=2.5)
        assert st["stop_price"] == 103
        assert st["take_price"] == 95

    def test_invalid_side(self):
        try:
            calculate_stop_take(100, 2, "sideways", 1.5, 2.5)
        except ValueError:
            return
        raise AssertionError("ValueError bekleniyordu")


class TestCircuitBreaker:
    def test_trips_at_loss_limit(self):
        cb = CircuitBreaker(daily_loss_limit_pct=0.05, starting_balance=10000)
        assert not cb.should_stop_trading()
        cb.update_balance(9450)   # %5.5 kayıp
        assert cb.should_stop_trading()

    def test_stays_open_below_limit(self):
        cb = CircuitBreaker(daily_loss_limit_pct=0.05, starting_balance=10000)
        cb.update_balance(9700)
        assert not cb.should_stop_trading()

    def test_latches_after_trip(self):
        cb = CircuitBreaker(daily_loss_limit_pct=0.05, starting_balance=10000)
        cb.update_balance(9400)
        assert cb.should_stop_trading()
        # Bakiye düzelse bile (sanal) tripped kalmalı
        cb.update_balance(11000)
        assert cb.should_stop_trading()