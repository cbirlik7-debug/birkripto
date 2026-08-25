"""Paper broker ve sinyal motoru birim testleri."""
import asyncio

import pytest

from src.execution.paper_broker import PaperBroker
from src.execution.base import OrderRequest
from src.execution.registry import available_brokers


def _run(coro, loop=None):
    """Kısa asenkron test için yeni bir loop kullanır."""
    new_loop = loop or asyncio.new_event_loop()
    try:
        return new_loop.run_until_complete(coro)
    finally:
        new_loop.close()


class TestPaperBroker:
    def test_open_and_close_long(self):
        broker = PaperBroker(starting_balance=10000, taker_fee=0.0004)
        req = OrderRequest(symbol="BTCUSDT", side="long", quantity=0.1, entry_price=100.0,
                           stop_price=97.0, take_price=110.0, strategy_id="s1",
                           confidence_score=85.0)
        opened = _run(broker.open_position(req))
        assert opened.status == "opened"
        assert opened.entry_price >= 100.0  # slippage üst

        # fiyat yükseldi
        closed = _run(broker.close_position(opened.order_id, 105.0))
        assert closed.status == "closed"
        assert closed.meta["pnl"] > 0

    def test_insufficient_balance_rejected(self):
        broker = PaperBroker(starting_balance=100, taker_fee=0.0004)
        req = OrderRequest(symbol="BTCUSDT", side="long", quantity=10.0, entry_price=1000.0,
                           strategy_id="s1", confidence_score=50)
        res = _run(broker.open_position(req))
        assert res.status == "rejected"

    def test_slippage_direction(self):
        broker = PaperBroker(starting_balance=10000)
        req = OrderRequest(symbol="X", side="short", quantity=1.0, entry_price=100.0)
        res = _run(broker.open_position(req))
        assert res.entry_price <= 100.0  # short giriş slipaj alt

    def test_broker_registered(self):
        from src.execution.registry import available_brokers
        assert "paper" in available_brokers()


class TestSignalEngineIntegration:
    def test_trending_data_blanc(self):
        from src.config_loader import load_strategies
        from src.signals.signal_engine import SignalEngine
        from tests.conftest import make_ohlcv

        strat = load_strategies(status="active")[0]
        engine = SignalEngine(indicator_configs=strat["indicators"], rules=[])
        df = make_ohlcv(n=400, seed=3, trend=0.9)
        decision = engine.evaluate(df, min_confidence=70)
        # Sinyal üretilemeyebilir ama hata vermemeli ve yapı doğru olmalı
        assert set(["direction", "confidence", "votes", "weights", "min_volatility_ok",
                    "rules_applied", "decision_reasons"]).issubset(decision.keys())
        assert decision["direction"] in ("long", "short", "none")

    def test_threshold_above_confidence_blocks(self):
        from src.config_loader import load_strategies
        from src.signals.signal_engine import SignalEngine
        from tests.conftest import make_ohlcv

        strat = load_strategies(status="active")[0]
        engine = SignalEngine(indicator_configs=strat["indicators"], rules=[])
        df = make_ohlcv(n=300, seed=1, trend=0)
        low_dec = engine.evaluate(df, min_confidence=40)
        high_dec = engine.evaluate(df, min_confidence=90)
        # Yüksek eşik en az düşük eşik kadar az sinyal üretmeli
        assert (high_dec["direction"] == "none") or (low_dec["confidence"]["best_score"] >=
                                                      high_dec["confidence"]["best_score"])