"""Backtest motoru ve SQLite strateji istatistikleri testleri."""
import os
import tempfile

import pytest

from src.backtest.backtester import Backtester, BacktestResult
from src.config_loader import load_strategies
from src.portfolio.trade_logger import TradeLogger
from tests.conftest import make_ohlcv


class TestBacktester:
    def test_trending_data_opens_trades(self):
        strat = load_strategies(status="active")[0]
        bt = Backtester(strat)
        df = make_ohlcv(n=500, seed=3, trend=0.8)
        res = bt.run(df, min_confidence=60)
        assert isinstance(res, BacktestResult)
        # Özet anahtarları mevcut
        s = res.summary()
        for k in ("total_return", "win_rate", "avg_rr", "max_drawdown", "trade_count"):
            assert k in s

    def test_summary_properties(self):
        res = BacktestResult("s1", "BTCUSDT", initial_balance=1000, final_balance=1100)
        assert res.total_return == pytest.approx(0.1)


class TestTradeLogger:
    def test_open_close_updates_stats(self):
        with tempfile.TemporaryDirectory() as td:
            db = TradeLogger(db_path=os.path.join(td, "test.db"))
            tid = db.open_trade("btc_v1", "BTCUSDT", "long", 100.0, 0.1, 80.0)
            assert tid is not None
            db.close_trade(tid, 150.0, pnl=5.0, result="win")
            stats = db.get_all_strategy_stats()
            assert len(stats) == 1
            assert stats[0]["strategy_id"] == "btc_v1"
            assert stats[0]["wins"] == 1
            assert stats[0]["total_pnl"] == pytest.approx(5.0)

    def test_signal_log(self):
        with tempfile.TemporaryDirectory() as td:
            db = TradeLogger(db_path=os.path.join(td, "s.db"))
            db.log_signal("s1", "BTCUSDT", "15m", "long", 85.0,
                          {"ema": "long"}, {"ema": 0.5}, "low", 80, "open", "test")
            trades = db.get_trades()
            assert len(trades) == 0  # signal tablosu trades'ten ayrı