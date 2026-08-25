"""Geçmiş işlemleri strateji bazlı özetler (LLM danışmana girdi, Bölüm 9.4).

SQLite'daki trades + strategy_stats tablolarından istatistiksel özet
çıkarır: win rate, ortalama R:R, hangi saatlerde/sembollerde kayıp vb.
Ham veri değil, özet metin üretir.
"""
import logging

from ..portfolio.trade_logger import TradeLogger

logger = logging.getLogger(__name__)


class TradeHistoryReport:
    """Strateji bazlı işlem geçmişi özetleyicisi."""

    def __init__(self, db_path: str = "data/bot.db"):
        self.db = TradeLogger(db_path=db_path)

    def build(self, strategy_id: str = None, limit: int = 1000) -> dict:
        trades = self.db.get_trades(strategy_id=strategy_id, limit=limit)
        if not trades:
            return {"strategy_id": strategy_id, "trade_count": 0}

        closed = [t for t in trades if t.get("status") == "closed" or t.get("pnl") is not None]
        n = len(closed)
        wins = sum(1 for t in closed if (t.get("pnl") or 0) > 0)
        total_pnl = sum(t.get("pnl") or 0 for t in closed)
        avg_rr = 0.0

        # Saatlik kayıp analizi (UTC)
        hourly = {}
        for t in closed:
            et = t.get("entry_time") or ""
            hour = et[11:13] if len(et) >= 13 else "?"
            hourly.setdefault(hour, {"count": 0, "pnl": 0.0})
            hourly[hour]["count"] += 1
            hourly[hour]["pnl"] += t.get("pnl") or 0.0

        worst_hours = sorted(hourly.items(), key=lambda kv: kv[1]["pnl"])[:3]

        return {
            "strategy_id": strategy_id,
            "trade_count": n,
            "wins": wins,
            "losses": n - wins,
            "win_rate": (wins / n) if n else 0.0,
            "total_pnl": round(total_pnl, 2),
            "avg_pnl": round(total_pnl / n, 2) if n else 0.0,
            "avg_rr": avg_rr,
            "worst_hours_utc": worst_hours,
        }

    def to_text(self, strategy_id: str = None) -> str:
        s = self.build(strategy_id)
        if s["trade_count"] == 0:
            target = strategy_id or "tüm stratejiler"
            return f"[İşlem Geçmişi] {target} için işlem yok."
        hours = ", ".join(f"{h}.saat:{d['pnl']:.2f}" for h, d in s["worst_hours_utc"])
        return (
            f"[İşlem Geçmişi Özeti] strateji={s['strategy_id']}\n"
            f"- İşlem sayısı: {s['trade_count']} (win={s['wins']}, loss={s['losses']})\n"
            f"- Win rate: %{s['win_rate'] * 100:.1f}\n"
            f"- Toplam PNL: {s['total_pnl']}\n"
            f"- Ortalama PNL: {s['avg_pnl']}\n"
            f"- En kötü saatler (UTC): {hours}\n"
        )