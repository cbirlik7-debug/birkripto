"""Ana çalıştırma giriş noktası (Bölüm 3, 7, 9.3, 15).

Kullanım:
    python -m src.main --strategy btc_conservative_v1
    python -m src.main                          # tüm active stratejiler
    python -m src.main --compare-strategies     # config'lerin performans tablosu
    python -m src.main --list-strategies        # aktif strateji listesi

Güvenlik (Bölüm 15):
- Live mod yalnızca `--confirm-live` ile başlar; default mod paper'dır.
- Circuit breaker her koşulda aktiftir.
"""
import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.config_loader import load_global_config, load_strategies, load_strategy_config
from src.strategy_runner import StrategyRunner

logger = logging.getLogger("kripto_bot")


def setup_logging(global_cfg: dict) -> None:
    log_cfg = global_cfg.get("logging", {})
    level = getattr(logging, str(log_cfg.get("level", "INFO")).upper(), logging.INFO)
    handlers = [logging.StreamHandler()]
    if log_cfg.get("file"):
        log_path = PROJECT_ROOT / log_cfg["file"]
        log_path.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(log_path))
    logging.basicConfig(
        level=level,
        format="%(asctime)s UTC %(levelname)s %(name)s: %(message)s",
        handlers=handlers,
    )


def compare_strategies() -> None:
    """Tüm aktif stratejilerin performans özetini tablo olarak basar (Bölüm 9.3)."""
    from src.portfolio.trade_logger import TradeLogger
    global_cfg = load_global_config()
    db_path = global_cfg.get("database", {}).get("path", "data/bot.db")
    db_logger = TradeLogger(db_path=db_path)
    stats = db_logger.get_all_strategy_stats()
    strategies = load_strategies(status="active")

    print("\n=== Strateji Karşılaştırma (strategy_stats) ===")
    if not stats:
        print("Henüz işlem yok — önce paper modda bot çalıştırın.")
    for s in stats:
        print(
            f"{s['strategy_id']:<22} işlem:{s['total_trades']:>4}  "
            f"win:%{s['win_rate']*100:5.1f}  toplamPNL:{s['total_pnl']:>10.2f}  "
            f"avgPNL:{s['avg_pnl']:>8.2f}  maxDD:{s['max_drawdown']:>8.2f}"
        )
    print("\n=== Aktif Strateji Config'leri ===")
    for sc in strategies:
        print(f"- {sc['strategy_id']} ({sc.get('name', '')}) "
              f"sembol={sc.get('symbol')} timeframe={sc.get('timeframe')} "
              f"risk={sc.get('risk_level')}")
    print()


def list_strategies() -> None:
    for sc in load_strategies(status="active"):
        print(f"{sc['strategy_id']:<24} {sc.get('name', ''):<20} "
              f"{sc.get('symbol'):<10} {sc.get('timeframe'):<5} {sc.get('risk_level')}")


def run_backtest(strategy_id: str, lookback: int = 1000, timeframe: str = "15m") -> None:
    """Belirtilen stratejiyi Binance geçmiş verisi üzerinde geriye dönük test eder."""
    from src.backtest.backtester import Backtester
    from src.data.binance_client import BinanceClient

    sc = load_strategy_config(strategy_id)
    if not sc:
        logger.error("Strateji bulunamadı: %s", strategy_id)
        return
    # Config'teki timeframe kullanılamıyorsa argümanı kullan
    tf = sc.get("timeframe", timeframe)
    client = BinanceClient()
    df = client.fetch_klines(sc["symbol"], tf, limit=lookback)
    bt = Backtester(sc)
    res = bt.run(df, min_confidence=sc.get("entry", {}).get("min_confidence_threshold"))
    summary = res.summary()
    print("\n=== Backtest Sonucu ===")
    for k, v in summary.items():
        print(f"{k:<16}: {v}")
    print()


async def run_all(strategies: list, global_cfg: dict) -> None:
    """Tüm stratejileri aynı anda (paralel) çalıştırır."""
    runners = [StrategyRunner(sc, global_cfg) for sc in strategies]
    await asyncio.gather(*(r.run() for r in runners))


def main() -> None:
    parser = argparse.ArgumentParser(description="Kripto Trading Bot (paper mod)")
    parser.add_argument("--strategy", help="Yalnızca bu strategy_id'yi çalıştır")
    parser.add_argument("--compare-strategies", action="store_true",
                        help="Tüm strateji config'lerinin performans tablosunu bas")
    parser.add_argument("--list-strategies", action="store_true",
                        help="Aktif strateji listesini bas")
    parser.add_argument("--backtest", metavar="STRATEGY_ID",
                        help="Belirtilen stratejiyi Binance geçmiş verisinde test et")
    parser.add_argument("--confirm-live", action="store_true",
                        help="Live moda geçiş için zorunlu onay (Bölüm 15)")
    args = parser.parse_args()

    global_cfg = load_global_config()
    setup_logging(global_cfg)

    if args.compare_strategies:
        compare_strategies()
        return
    if args.list_strategies:
        list_strategies()
        return
    if args.backtest:
        run_backtest(args.backtest)
        return

    exec_mode = global_cfg.get("execution", {}).get("mode", "paper")
    if exec_mode == "live" and not args.confirm_live:
        logger.error("Live mod için --confirm-live onayı zorunludur. Durduruldu.")
        sys.exit(1)

    if args.strategy:
        sc = load_strategy_config(args.strategy)
        if not sc:
            logger.error("Strateji bulunamadı: %s", args.strategy)
            sys.exit(1)
        strategies = [sc]
    else:
        strategies = load_strategies(status="active")

    if not strategies:
        logger.warning("Aktif strateji bulunamadı (config/strategies/). Çıkılıyor.")
        return

    logger.info("%d strateji başlatılıyor (%s modu)...", len(strategies), exec_mode)
    asyncio.run(run_all(strategies, global_cfg))


if __name__ == "__main__":
    main()