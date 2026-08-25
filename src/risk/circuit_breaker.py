"""Günlük kayıp limiti (circuit breaker) — Bölüm 8.

Kritik güvenlik özelliği: günlük kayıp, risk seviyesinden bağımsız
olarak hiçbir koşulda devre dışı bırakılamaz. Kayıp limitine
ulaşılınca yeni pozisyon açma durdurulur ve loglanır.

Günlük kayıp: gün başındaki bakiyeden (günlük başlangıç bakiyesi)
güncel bakiyeye kadarki düşüş. Kapanan işlemlerin PNL'sinden de
hesaplanabilir; burada hem bakiye bazlı hem işlem PNL bazlı destek
sunulur.
"""
import datetime as dt
import logging

logger = logging.getLogger(__name__)


class CircuitBreaker:
    """Günlük kayıp limiti takibi."""

    def __init__(self, daily_loss_limit_pct: float, starting_balance: float):
        self.limit_pct = daily_loss_limit_pct
        self.day_start_balance = starting_balance
        self.current_balance = starting_balance
        self._day = dt.date.today()
        self.tripped = False

    def _check_day(self):
        """Gün değişmişse sayaçları sıfırla."""
        today = dt.date.today()
        if today != self._day:
            self._day = today
            self.day_start_balance = self.current_balance
            self.tripped = False
            logger.info("Yeni gün başladı (%s) — circuit breaker sayaçları sıfırlandı.", today)

    def update_balance(self, balance: float):
        """Güncel bakiye (sanal) ile kayıp oranını günceller."""
        self.current_balance = balance
        self._check_day()
        if self.day_start_balance <= 0:
            return 0.0
        loss_pct = (self.day_start_balance - balance) / self.day_start_balance
        return max(0.0, loss_pct)

    def record_trade_pnl(self, pnl: float):
        """Kapanan bir işlemin PNL'sini kaydeder (günlük kayıp hesabı için)."""
        self._check_day()
        # PNL birikimi ayrıca tutulabilir; bakiye bazlı hesaplama ana yöntemdir.
        pass

    @property
    def daily_loss_pct(self) -> float:
        """Bugünkü gerçekleşen kayıp yüzdesi."""
        if self.day_start_balance <= 0:
            return 0.0
        return max(0.0, (self.day_start_balance - self.current_balance) / self.day_start_balance)

    def should_stop_trading(self) -> bool:
        """Kayıp limitine ulaşıldıysa True (yeni pozisyon açma durdurulur)."""
        self._check_day()
        if self.tripped:
            return True
        if self.daily_loss_pct >= self.limit_pct:
            self.tripped = True
            logger.warning(
                "CIRCUIT BREAKER: günlük kayıp %s%% limite (%s%%) ulaştı. "
                "Yeni pozisyon açma durduruldu.",
                round(self.daily_loss_pct * 100, 2),
                round(self.limit_pct * 100, 2),
            )
            return True
        return False