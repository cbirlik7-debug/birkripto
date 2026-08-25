# Kripto Trading Bot

Binance USDT-M Futures piyasasında **long/short** pozisyon sinyali üreten,
çoklu teknik indikatör **confluence** (uyuşum) mantığına dayalı, **paper
trading** modunda çalışan modüler bir kripto trading botu.

> ⚠️ **Risk uyarısı:** Bu sistem olasılıksal bir karar destek/otomasyon
> aracıdır, kesin kâr garantisi vermez. Bu sürüm yalnızca **paper trading**
> (sanal bakiye) kapsar; gerçek para ile otomatik işlem **yoktur**.

---

## Özellikler

- **Confluence sinyal motoru** — EMA + RSI + Volume Profile oylarının ağırlıklı
  uyuşumuyla 0-100 güven skoru (tek indikatöre değil uyuşuma dayalı karar)
- **Risk profilleri** — `low` / `medium` / `high` seviyeleri pozisyon
  büyüklüğü, kaldıraç, stop/take mesafesi ve güven eşiğini otomatik ayarlar
- **Paper trading** — sanal bakiye, slippage + komisyon simülasyonu
- **Günlük kayıp limiti (circuit breaker)** — her koşulda aktif güvenlik
- **Strateji config'leri** — her sembol için bağımsız, isimli YAML dosyaları
  ve `strategy_id` bazlı performans takibi (SQLite)
- **Backtest motoru** — geçmiş veri üzerinde strateji testi + parametre taraması
- **LLM Strateji Danışmanı** (opsiyonel) — yerel Ollama ile yeni strateji
  taslağı önerir; yalnızca `config/proposed_strategies/` klasörüne yazar
- **Modüler mimari** — indikatör/sinyal/risk/broker katmanları registry'e
  dayalı; yeni modül eklemek mevcut kodu değiştirmez

---

## Gereksinimler

- Python 3.11+ (3.11 / 3.12 / 3.13 ile CI'da test edilir)
- (Opsiyonel) Yerel LLM için Ollama — `llama3.1:8b-instruct-q4` vb.

## Kurulum

```bash
# 1. Repoyu klonla
git clone <repo-url> && cd kripto-bot

# 2. Sanal ortam oluştur ve bağımlılıkları kur
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 3. .env dosyasını hazırla (paper mod için boş bırakılabilir)
cp config/.env.example config/.env
```

## Çalıştırma

```bash
# Tüm aktif stratejileri paper modda başlat (websocket)
python -m src.main

# Yalnızca belirli bir strateji
python -m src.main --strategy btc_conservative_v1

# Aktif strateji listesi
python -m src.main --list-strategies

# Strateji karşılaştırma (strategy_stats tablosundan)
python -m src.main --compare-strategies

# Backtest (Binance geçmiş verisi üzerinde)
python -m src.main --backtest btc_conservative_v1

# LLM Strateji Danışmanı (proposed_strategies/'e taslak yazar)
python -m src.analysis.strategy_advisor --symbol BTCUSDT
```

> 🛡️ Live moda geçiş yalnızca `config/global.yaml` içinde
> `execution.mode: live` **ve** `--confirm-live` bayrağı birlikteyken
> mümkündür. Bu sürümde live broker henüz uygulanmamıştır (Faz 2).

## Testler

```bash
python -m pytest -q        # birim testleri (indikatör, risk, sinyal, broker, backtest)
```

---

## Yapılandırma

### Katmanlı yapı

| Dosya | Görev |
|---|---|
| `config/global.yaml` | Borsa, DB yolu, fee, execution modu, LLM ayarları |
| `config/strategies/*.yaml` | Her strateji: sembol, timeframe, indikatör ağırlıkları, eşik, risk |
| `config/proposed_strategies/` | LLM'in ürettiği onaylanmamış taslaklar |
| `config/.env` | API anahtarları (gitignore'da) |

### Yeni strateji ekleme

1. `config/strategies/sembol_strateji.yaml` dosyası oluşturun
2. Benzersiz bir `strategy_id` verin (değişmez kimlik, DB'de bununla eşleşir)
3. `status: active` yapın — bot bir sonraki başlatmada otomatik yükler

```yaml
strategy_id: btc_conservative_v1
name: "BTC Muhafazakâr"
symbol: BTCUSDT
timeframe: 15m
risk_level: low
indicators:
  ema:
    enabled: true
    short_period: 9
    long_period: 21
    weight: 0.35
  rsi:
    enabled: true
    period: 14
    weight: 0.30
  volume_profile:
    enabled: true
    lookback_periods: 100
    weight: 0.35
  atr:
    enabled: true
    period: 14
    min_volatility_mult: 0.0005
entry:
  min_confidence_threshold: 80
status: active
```

### Yeni indikatör ekleme (modüler)

1. `src/indicators/` altına dosya ekleyin
2. `BaseIndicator`'ı miras alın, `@register_indicator` ekleyin
3. `config`'ten `enabled` / `weight` verin — koda dokunmaya gerek yok

```python
# src/indicators/macd.py
from .base import BaseIndicator
from .registry import register_indicator

@register_indicator
class MACDIndicator(BaseIndicator):
    name = "macd"
    def calculate(self, df, params): ...
    def vote(self, df) -> str: ...
```

Devre dışı bırakılan modülün ağırlığı otomatik olarak kalan modüllere
yeniden dağıtılır (toplam %100 korunur).
---

## Mimari

```
src/
├── data/           Binance REST + WebSocket (retry/backoff, OHLCV buffer)
├── indicators/     EMA, RSI, ATR, Volume Profile (registry'e kayıtlı)
├── signals/        Confluence motoru, güven skoru, ağırlık normalizasyonu
├── risk/           Risk profilleri, pozisyon büyüklüğü, stop/take, circuit breaker
├── execution/      Paper broker (slippage+fee); live broker iskeleti (Faz 2)
├── portfolio/      Açık pozisyon takibi, SQLite (trades + strategy_stats)
├── backtest/       Geçmiş veri simülasyonu + grid search
├── analysis/       Piyasa/geçmiş özeti + LLM strateji danışmanı
└── main.py         CLI giriş noktası
```

Her katman **Base sınıf + Registry** deseniyle çalışır; bu sayede yeni
modüller bağımsız eklenir, test edilebilir ve tek satır config ile açılıp
kapatılabilir.

## Veritabanı

`data/bot.db` (SQLite, gitignore'da) şu tabloları barındırır:

- `trades` — her işlemin giriş/çıkış, PNL, güven skoru, strateji kimliği
- `strategy_stats` — strateji bazlı win rate / toplam PNL / max drawdown
- `signals` — her karar anı: indikatör oyları, ağırlıklar, eşik, gerekçe

Tüm zaman damgaları **UTC**'dir.

## Güvenlik Kuralları

- API anahtarları yalnızca `.env`'de tutulur; `.env` gitignore'dadır
- Live moda geçiş `--confirm-live` onaysız engellenir
- Circuit breaker (günlük kayıp limiti) devre dışı bırakılamaz
- LLM danışmanı asla aktif config'i değiştirmez; yalnızca `proposed_strategies/`
  klasörüne taslak yazar

## Lisans

Şartnameye göre özel proje — geliştirme amacıyla oluşturulmuştur.
