"""SQLite veritabanına işlem/sinyal kaydı.

Şema (Bölüm 9.3 + Bölüm 13):
- trades      : her kapanan işlem, strategy_id bağlantılı
- strategy_stats : strateji bazlı özet istatistikler
- signals_log : her karar anı için indikatör oyları, güven skoru, gerekçe

Tüm zaman damgaları UTC'dir.
"""
import datetime as dt
import json
import logging
import sqlite3
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT NOT NULL,
    symbol TEXT,
    side TEXT,
    entry_time TEXT,
    exit_time TEXT,
    entry_price REAL,
    exit_price REAL,
    quantity REAL,
    pnl REAL,
    confidence_score REAL,
    stop_price REAL,
    take_price REAL,
    result TEXT,
    reason TEXT,
    status TEXT DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS strategy_stats (
    strategy_id TEXT PRIMARY KEY,
    total_trades INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    win_rate REAL DEFAULT 0.0,
    total_pnl REAL DEFAULT 0.0,
    avg_pnl REAL DEFAULT 0.0,
    max_drawdown REAL DEFAULT 0.0,
    last_updated TEXT
);

CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT,
    symbol TEXT,
    timeframe TEXT,
    timestamp TEXT,
    signal TEXT,
    confidence REAL,
    votes TEXT,
    weights TEXT,
    risk_level TEXT,
    threshold REAL,
    decision TEXT,
    reason TEXT
);
"""


class TradeLogger:
    """İşlem, strateji istatistiği ve sinyal loglarını SQLite'a yazar."""

    def __init__(self, db_path: str = "data/bot.db"):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._conn() as conn:
            conn.executescript(SCHEMA)
        logger.info("Veritabanı hazır: %s", self.db_path)

    def open_trade(self, strategy_id, symbol, side, entry_price, quantity,
                   confidence_score, stop_price=None, take_price=None, reason=""):
        """İşlem açılışını kaydeder ve trade id döner."""
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        with self._conn() as conn:
            cur = conn.execute(
                """INSERT INTO trades
                   (strategy_id, symbol, side, entry_time, entry_price, quantity,
                    confidence_score, stop_price, take_price, reason)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (strategy_id, symbol, side, now, entry_price, quantity,
                 confidence_score, stop_price, take_price, reason),
            )
            return cur.lastrowid

    def close_trade(self, trade_id, exit_price, pnl, result="win"):
        """İşlemi kapatır ve strateji istatistiklerini günceller."""
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM trades WHERE id=?", (trade_id,)).fetchone()
            if row is None:
                logger.warning("trade bulunamadı: %s", trade_id)
                return
            conn.execute(
                """UPDATE trades SET exit_time=?, exit_price=?, pnl=?, result=?, status='closed'
                   WHERE id=?""",
                (now, exit_price, pnl, result, trade_id),
            )
            self._update_strategy_stats(conn, row["strategy_id"])

    def _update_strategy_stats(self, conn, strategy_id):
        rows = conn.execute(
            """SELECT COUNT(*) as n,
                      SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
                      SUM(pnl) as total_pnl,
                      MIN(COALESCE(pnl,0)) as worst
               FROM trades WHERE strategy_id=? AND status='closed'""",
            (strategy_id,),
        ).fetchone()
        n = rows["n"] or 0
        wins = rows["wins"] or 0
        total_pnl = rows["total_pnl"] or 0.0
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        win_rate = wins / n if n else 0.0
        avg_pnl = total_pnl / n if n else 0.0
        worst = rows["worst"] or 0.0
        max_drawdown = abs(worst) if worst < 0 else 0.0
        conn.execute(
            """INSERT INTO strategy_stats
               (strategy_id, total_trades, wins, losses, win_rate, total_pnl, avg_pnl, max_drawdown, last_updated)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT(strategy_id) DO UPDATE SET
                 total_trades=excluded.total_trades,
                 wins=excluded.wins,
                 losses=excluded.losses,
                 win_rate=excluded.win_rate,
                 total_pnl=excluded.total_pnl,
                 avg_pnl=excluded.avg_pnl,
                 max_drawdown=excluded.max_drawdown,
                 last_updated=excluded.last_updated""",
            (strategy_id, n, wins, n - wins, win_rate, total_pnl, avg_pnl, max_drawdown, now),
        )

    def log_signal(self, strategy_id, symbol, timeframe, signal, confidence,
                   votes, weights, risk_level, threshold, decision, reason):
        """Bir sinyal değerlendirmesini loglar (Bölüm 13 — izlenebilirlik)."""
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO signals
                   (strategy_id, symbol, timeframe, timestamp, signal, confidence,
                    votes, weights, risk_level, threshold, decision, reason)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (strategy_id, symbol, timeframe, now, signal, confidence,
                 json.dumps(votes, ensure_ascii=False),
                 json.dumps(weights, ensure_ascii=False),
                 risk_level, threshold, decision, reason),
            )

    def get_trades(self, strategy_id: Optional[str] = None, limit: int = 100) -> list:
        with self._conn() as conn:
            if strategy_id:
                q = "SELECT * FROM trades WHERE strategy_id=? ORDER BY entry_time DESC LIMIT ?"
                return [dict(r) for r in conn.execute(q, (strategy_id, limit))]
            q = "SELECT * FROM trades ORDER BY entry_time DESC LIMIT ?"
            return [dict(r) for r in conn.execute(q, (limit,))]

    def get_all_strategy_stats(self) -> list:
        with self._conn() as conn:
            return [dict(r) for r in conn.execute("SELECT * FROM strategy_stats ORDER BY strategy_id")]