# Kripto Paper Trading Botu — Uygulama Dökümanı (v2, Web Mimarisi)

> Bu döküman önceki (Python/VSCode odaklı) sürümün yerine geçer. Mimari, kişisel sunucu olmadığı için **GitHub Pages + Supabase** üzerine kuruludur ve projenin **web arayüzü olması zorunludur.**

## 1. Proje Özeti

Binance verilerini kullanarak long/short pozisyon sinyalleri üreten, bu sinyalleri **sanal (paper) bakiye** üzerinde otomatik açıp kapatan ve sonuçları bir **web arayüzünde** gösteren bir sistem geliştirilecek. Gerçek para ile işlem yapılmayacak. Kişisel/kiralık bir sunucu **yok** — bu yüzden hem hesaplama hem barındırma tamamen ücretsiz/serverless servisler üzerinde çalışmalı.

## 2. Neden Bu Mimari — Kritik Kısıt

**GitHub Pages sadece statik dosya (HTML/CSS/JS) sunar; sunucu tarafı kod veya zamanlanmış görev (cron) çalıştıramaz.** Bir önceki denemede yaşanan sorun tam olarak buydu: bot mantığı (veri çekme, indikatör hesaplama, pozisyon simülasyonu) GitHub Pages üzerinde **çalışamaz**, çünkü orası sadece dosya sunucusudur, uygulama sunucusu değildir.

Bunu çözmek için görev ikiye ayrılıyor:
- **Hesaplama/"bot" katmanı → Supabase Edge Functions** (sunucu tarafı, zamanlanmış çalışan kod)
- **Görüntüleme/arayüz katmanı → GitHub Pages** (statik, tarayıcıda çalışan web arayüzü, Supabase'ten veri okur)

Bu ayrım sayesinde kişisel sunucu gerekmez; her iki servis de ücretsiz katmanda çalışır.

## 3. Genel Mimari

```
┌─────────────────────┐      periyodik (cron)      ┌──────────────────────────┐
│  GitHub Actions      │ ───────────────────────────▶│  Supabase Edge Function  │
│  (zamanlayıcı)       │      HTTP çağrısı           │  "run-bot-cycle"         │
└─────────────────────┘                              │  - Binance'ten veri çek  │
                                                       │  - İndikatörleri hesapla│
                                                       │  - Sinyal üret           │
                                                       │  - Paper trade simüle et│
                                                       └───────────┬──────────────┘
                                                                   │ yazar
                                                                   ▼
                                                       ┌──────────────────────────┐
                                                       │  Supabase Postgres DB    │
                                                       │  (sinyaller, pozisyonlar,│
                                                       │   trade'ler, equity)     │
                                                       └───────────┬──────────────┘
                                                                   │ okur (anon key)
                                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  GitHub Pages — Statik Web Arayüzü (React + TypeScript)                     │
│  Dashboard / Trade Geçmişi / Sinyal Log / Ayarlar / Strateji Karşılaştırma  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Zamanlama neden GitHub Actions'ta?** İki kuş bir taşla: hem bot döngüsünü tetikler hem de Supabase ücretsiz projesinin **7 gün hareketsizlik sonrası otomatik duraklatılmasını** engeller (her tetikleme veritabanına dokunduğu için proje aktif kalır). Supabase'in kendi `pg_cron` özelliği de alternatif olarak kullanılabilir ama dışarıdan gelen bir tetikleyici (GitHub Actions) daha görünür ve hatası fark edilir.

## 4. Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Frontend (barındırma) | GitHub Pages (statik site) |
| Frontend (framework) | React + TypeScript + Vite + TailwindCSS |
| Grafikler | Recharts veya Chart.js (equity curve, fiyat/indikatör görselleştirme) |
| Backend hesaplama | Supabase Edge Functions (Deno + TypeScript) |
| Veritabanı | Supabase Postgres |
| Zamanlama | GitHub Actions (scheduled workflow) → Edge Function'ı HTTP ile tetikler |
| Veri kaynağı | Binance REST API (public kline endpoint'i, key gerekmez) |
| CI/CD | GitHub Actions (frontend build + `gh-pages` branch'e deploy) |

## 5. Proje Klasör Yapısı

```
kripto-bot/
├── web/                                  # GitHub Pages'e deploy edilecek frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── EquityChart.tsx
│   │   │   ├── OpenPositionCard.tsx
│   │   │   ├── TradeHistoryTable.tsx
│   │   │   ├── SignalLogTable.tsx
│   │   │   ├── StrategyComparisonTable.tsx
│   │   │   └── RiskLevelSelector.tsx
│   │   ├── lib/
│   │   │   └── supabaseClient.ts         # sadece "anon" public key kullanır
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Trades.tsx
│   │   │   ├── Signals.tsx
│   │   │   ├── Strategies.tsx            # config karşılaştırma + LLM önerileri
│   │   │   └── Settings.tsx              # asset bazlı ayarlar, risk seviyesi
│   │   └── App.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── supabase/
│   ├── functions/
│   │   ├── run-bot-cycle/                # her asset+timeframe için bot döngüsü
│   │   │   ├── index.ts
│   │   │   ├── binance.ts
│   │   │   ├── indicators/
│   │   │   │   ├── ema.ts
│   │   │   │   ├── rsi.ts
│   │   │   │   ├── atr.ts
│   │   │   │   └── volumeProfile.ts
│   │   │   ├── signalEngine.ts
│   │   │   ├── riskProfiles.ts           # düşük/orta/yüksek risk parametre setleri
│   │   │   └── paperEngine.ts
│   │   └── suggest-strategy/             # LLM tabanlı strateji öneri modülü
│   │       ├── index.ts
│   │       └── promptBuilder.ts
│   └── migrations/
│       └── 0001_init.sql                 # tüm tablo şemaları
├── .github/
│   └── workflows/
│       ├── deploy-pages.yml              # web/ build edip GitHub Pages'e yayınlar
│       └── run-bot-cycle.yml             # zamanlanmış tetikleyici (cron)
└── README.md
```

**Pluggable modül prensibi:** Her indikatör (`indicators/*.ts`), sinyal motoru ve risk profili ayrı, birbirinden bağımsız dosyalar/fonksiyonlar olarak yazılmalı — hiçbiri diğerine sabit kodlanmış (hardcoded) şekilde bağımlı olmamalı. Yeni bir indikatör eklemek veya birini devre dışı bırakmak, `bot_config` tablosundaki bir liste/flag değiştirerek yapılabilmeli, kod değişikliği gerektirmemeli.

## 6. Veritabanı Şeması (Supabase Postgres)

```sql
-- Asset bazlı bot konfigürasyonu (her coin için ayrı satır)
create table bot_config (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,                    -- 'BTCUSDT'
  timeframe text not null default '15m',
  is_active boolean default true,
  risk_level text not null default 'medium', -- 'low' | 'medium' | 'high'
  enabled_indicators jsonb not null,       -- ["ema","rsi","atr","volume_profile"]
  indicator_params jsonb not null,         -- {ema_fast:12, ema_slow:26, rsi_period:14, ...}
  min_confluence_score int not null default 3,
  sl_atr_multiplier numeric not null default 2,
  tp_atr_multiplier numeric not null default 3,
  risk_per_trade_pct numeric not null default 2,
  commission_pct numeric not null default 0.04,
  created_at timestamptz default now()
);

-- Her config'in kendi sanal bakiyesi (config bazlı performans karşılaştırması için)
create table strategy_accounts (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id),
  balance numeric not null default 10000,
  starting_balance numeric not null default 10000,
  updated_at timestamptz default now()
);

create table positions (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id),
  symbol text not null,
  direction text not null,                 -- 'long' | 'short'
  entry_price numeric not null,
  size numeric not null,
  stop_loss numeric not null,
  take_profit numeric not null,
  status text not null default 'open',     -- 'open' | 'closed'
  opened_at timestamptz default now()
);

create table trades (
  id uuid primary key default gen_random_uuid(),
  position_id uuid references positions(id),
  config_id uuid references bot_config(id),
  symbol text not null,
  direction text not null,
  entry_price numeric not null,
  exit_price numeric not null,
  size numeric not null,
  pnl numeric not null,
  pnl_pct numeric not null,
  commission numeric not null,
  exit_reason text not null,               -- 'stop_loss' | 'take_profit' | 'reverse_signal'
  opened_at timestamptz not null,
  closed_at timestamptz default now()
);

create table signals (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id),
  symbol text not null,
  direction text not null,                 -- 'long' | 'short' | 'neutral'
  score int not null,
  price numeric not null,
  reasons jsonb not null,                  -- ["EMA trend up", "RSI 55 rising", ...]
  created_at timestamptz default now()
);

create table equity_snapshots (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id),
  balance numeric not null,
  created_at timestamptz default now()
);

-- LLM modülünün önerdiği yeni strateji konfigürasyonları (henüz canlıya alınmamış)
create table strategy_suggestions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  suggested_config jsonb not null,         -- bot_config ile aynı şekilde
  based_on_analysis text not null,         -- LLM'in gerekçesi
  status text not null default 'pending',  -- 'pending' | 'accepted' | 'rejected'
  created_at timestamptz default now()
);
```

**Row Level Security (RLS):** Tüm tablolarda RLS açık olmalı. `anon` (public, frontend) rolüne sadece **SELECT** izni verilir — hiçbir tabloya frontend'den yazma izni yok. Yazma işlemleri yalnızca Edge Function içinde `service_role` key ile yapılır (bu key **asla** frontend koduna veya public repo'ya girmemeli, sadece Supabase Edge Function ortam değişkeni olarak saklanır).

## 7. İndikatörler (Deno/TypeScript — Edge Function içinde)

Aynı 4 indikatör, aynı mantık, artık TypeScript'te:

- **EMA (trend):** hızlı/yavaş periyot karşılaştırması.
- **RSI (momentum):** 14 periyot, Wilder smoothing.
- **ATR (volatilite):** 14 periyot, stop-loss/take-profit mesafesi için.
- **Volume Profile (destek/direnç):** POC, VAH, VAL hesaplama.

Formüller ve mantık önceki dökümanla birebir aynı (bkz. eski döküman Bölüm 6) — sadece uygulama dili değişti. Her indikatör fonksiyonu saf (pure) olmalı: girdi mum verisi + parametreler, çıktı hesaplanmış değerler; test edilebilir olsun diye state tutmamalı.

**Önemli fark:** `indicator_params` artık `bot_config` tablosundan, **her asset için ayrı ayrı** okunur. Örneğin BTC için `rsi_period: 14`, daha volatil bir altcoin için `rsi_period: 10` gibi farklı değerler kullanılabilir.

## 8. Risk Seviyeleri (`riskProfiles.ts`)

Kullanıcı arayüzden (Settings sayfası, `RiskLevelSelector` bileşeni) her asset için üç seviyeden birini seçebilir. Seviye, `bot_config` tablosundaki ilgili satırı günceller:

| Parametre | Düşük Risk | Orta Risk | Yüksek Risk |
|---|---|---|---|
| `min_confluence_score` | 4/4 (tüm kriterler aynı yönde) | 3/4 | 2/4 |
| `risk_per_trade_pct` | %1 | %2 | %4 |
| `sl_atr_multiplier` | 1.5 (dar stop) | 2 | 3 (geniş stop) |
| `tp_atr_multiplier` | 2 | 3 | 4 |

Bu tablo başlangıç değerleridir; `bot_config.indicator_params` içinde saklanır, kod değiştirmeden ayarlanabilir olmalı.

## 9. Sinyal Motoru (`signalEngine.ts`)

Mantık önceki dökümanla aynı — confluence tabanlı puanlama (EMA trend + RSI momentum + Volume Profile konumu + ATR volatilite filtresi), ama artık:
- Aktif olan indikatörler `bot_config.enabled_indicators` listesinden okunur (bir indikatör devre dışı bırakılırsa o kriter puanlamaya dahil edilmez, toplam kriter sayısı buna göre ayarlanır).
- Eşik değeri (`min_confluence_score`) seçilen risk seviyesine göre değişir.
- Çıktı `signals` tablosuna yazılır (üretilmese/NEUTRAL olsa bile, `reasons` alanıyla birlikte — arayüzde "neden sinyal yok" görülebilsin diye).

## 10. Paper Trading Motoru (`paperEngine.ts`)

Önceki dökümanla aynı mantık (sanal bakiye, ATR bazlı SL/TP, komisyon simülasyonu, PnL hesaplama) — tek fark, artık **her `config_id` kendi `strategy_accounts` satırında ayrı bakiye tutar.** Bu, farklı risk seviyelerinin veya farklı indikatör kombinasyonlarının paralel olarak test edilip performanslarının karşılaştırılmasını sağlar (bkz. Bölüm 12).

Her Edge Function çalıştığında (`run-bot-cycle`):
1. `bot_config` tablosundan aktif (`is_active = true`) tüm asset+config kombinasyonlarını çeker.
2. Her biri için ayrı ayrı: kline verisini çek → indikatörleri hesapla → sinyal üret → açık pozisyon varsa SL/TP kontrolü yap → gerekirse yeni pozisyon aç/kapat → `equity_snapshots`'a bakiye kaydı düş.
3. İşlem idempotent olmalı: aynı mum için iki kez sinyal/trade üretilmemeli (son işlenen mum zaman damgası kontrol edilerek).

## 11. LLM Strateji Öneri Modülü (`suggest-strategy` Edge Function)

Bu modül **canlı trade'lere doğrudan müdahale etmez** — sadece periyodik olarak (örn. günde bir, ayrı bir GitHub Actions cron ile tetiklenir) şunları yapar:
1. Son N günün `trades`, `signals` ve `equity_snapshots` verisini okur.
2. Hangi indikatör kombinasyonlarının/risk seviyelerinin daha iyi performans gösterdiğini analiz eder.
3. Bir LLM API çağrısı (Anthropic API) ile yeni bir strateji konfigürasyonu **önerisi** üretir — isim, açıklama ve gerekçeyle birlikte.
4. Öneriyi `strategy_suggestions` tablosuna `status: 'pending'` olarak yazar.

Frontend'deki **Strategies** sayfasında bu öneriler listelenir; kullanıcı isterse "Kabul Et" diyerek öneriyi yeni bir `bot_config` satırına dönüştürüp aktif eder (bu adım kullanıcı onayı gerektirir, otomatik canlıya alınmaz), isterse reddeder.

## 12. Frontend — Sayfalar ve Bileşenler

- **Dashboard:** Aktif config'lerin özet kartları (bakiye, açık pozisyon, son 24s PnL), genel equity curve grafiği.
- **Trades:** Filtrelenebilir (asset, config, tarih aralığı) trade geçmişi tablosu.
- **Signals:** Son sinyaller (LONG/SHORT/NEUTRAL), skor ve gerekçe listesiyle — "neden bu sinyal üretildi/üretilmedi" şeffaflığı için.
- **Strategies:** Farklı config'lerin (risk seviyesi, indikatör seti) yan yana performans karşılaştırması (win rate, toplam PnL, max drawdown) + LLM'in bekleyen strateji önerileri.
- **Settings:** Asset bazlı ayarlar (aktif/pasif, risk seviyesi seçimi, hangi indikatörlerin açık olduğu) — burada yapılan değişiklikler `bot_config` tablosunu günceller (frontend'in `anon` key'le yazma izni olmadığı için bu güncelleme, `anon` key'e **sınırlı ve kontrollü** bir RPC/Edge Function üzerinden yapılmalı, doğrudan tabloya değil).

Veri okuma tarafında frontend, Supabase JS client ile doğrudan `select` sorguları veya **Supabase Realtime** aboneliği kullanarak yeni trade/sinyal geldiğinde arayüzü otomatik güncelleyebilir.

## 13. Zamanlama Detayı (`.github/workflows/run-bot-cycle.yml`)

- Cron ifadesi, en kısa aktif `timeframe` değerine göre ayarlanır (örn. 15 dakikalık mumlar için `*/15 * * * *`).
- Workflow adımı: Edge Function URL'ine `curl` veya `fetch` ile POST isteği atar (kimlik doğrulama için Supabase `service_role` veya özel bir fonksiyon anahtarı, **GitHub Actions encrypted secrets** içinde saklanır — asla kod içine yazılmaz).
- Bu workflow public repo'da ücretsiz çalışır (GitHub Actions, public repo'larda ücretsizdir).

## 14. Güvenlik — Kritik Kurallar

- Repo **public** olacağı için (GitHub Pages ücretsiz katmanı public repo gerektirir): `service_role` key, Binance API secret (ileride gerçek trading eklenirse) gibi hiçbir gizli anahtar **asla** repoya commit edilmemeli.
- Frontend sadece Supabase `anon` (public) key kullanır; bu key zaten public olması amaçlanan bir anahtardır, RLS politikaları asıl güvenliği sağlar.
- Tüm gizli anahtarlar: Supabase Edge Function ortam değişkenleri + GitHub Actions encrypted secrets içinde tutulur.
- `.env`, `.env.local` gibi dosyalar `.gitignore`'a eklenmeli.

## 15. Test Planı

- İndikatör fonksiyonları için Deno test dosyaları (`deno test`), bilinen referans değerlerle karşılaştırma.
- `signalEngine` için farklı `enabled_indicators` ve skor kombinasyonlarının doğru `Signal` çıktısı ürettiğinin testi.
- `paperEngine` için pozisyon açma/kapama, SL/TP tetiklenmesi, komisyon ve çoklu `config_id` bakiye izolasyonunun testi.
- Migration dosyalarının yerel bir Supabase CLI ortamında (`supabase start`) sorunsuz çalıştığının doğrulanması.

## 16. Geliştirme Aşamaları

1. **Faz 1 — Veritabanı:** Supabase projesi kurulumu, migration dosyası, RLS politikaları.
2. **Faz 2 — Edge Function çekirdeği:** `run-bot-cycle` — Binance veri çekme, tek bir asset için indikatörler + sinyal motoru (henüz trade açmadan, sadece `signals` tablosuna yazarak doğrulama).
3. **Faz 3 — Paper Trading:** `paperEngine.ts`, çoklu config desteği, `strategy_accounts` izolasyonu.
4. **Faz 4 — Zamanlama:** GitHub Actions workflow'ları (deploy + cron), uçtan uca canlı veri testi.
5. **Faz 5 — Frontend:** Dashboard, Trades, Signals sayfaları; Supabase'e salt-okunur bağlantı.
6. **Faz 6 — Risk seviyeleri + asset bazlı ayarlar:** Settings sayfası, `RiskLevelSelector`, config güncelleme RPC'si.
7. **Faz 7 — Strateji karşılaştırma:** `Strategies` sayfası, çoklu config performans tablosu.
8. **Faz 8 — LLM öneri modülü:** `suggest-strategy` Edge Function + `strategy_suggestions` akışı + arayüzde kabul/red.

## 17. Kabul Kriterleri

- [ ] Bot mantığı tamamen Supabase Edge Function içinde çalışıyor, GitHub Pages sadece görüntüleme yapıyor.
- [ ] GitHub Actions cron, timeframe'e uygun aralıkla Edge Function'ı tetikliyor ve Supabase projesini aktif tutuyor.
- [ ] En az 2 farklı `bot_config` (örn. farklı risk seviyeleri) paralel çalışıp ayrı bakiyelerle izleniyor.
- [ ] Frontend, GitHub Pages üzerinde canlı erişilebilir durumda, Supabase'ten gerçek zamanlı/güncel veri okuyor.
- [ ] Hiçbir gizli anahtar repo içinde yer almıyor; RLS politikaları frontend'in sadece okuma yapabildiğini garanti ediyor.
- [ ] LLM strateji önerisi modülü çalışıp öneriyi veritabanına yazabiliyor, kullanıcı onayı olmadan hiçbir öneri otomatik aktif olmuyor.
- [ ] Ayarlar sayfasından risk seviyesi ve indikatör seçimi değiştirilebiliyor, kod değişikliği gerekmiyor.

## 18. Önemli Notlar / Kısıtlar

- Bu proje **yatırım tavsiyesi değildir**, yalnızca strateji test/öğrenme aracıdır.
- Supabase ücretsiz katmanı: 500MB veritabanı, aylık 500.000 Edge Function çağrısı gibi sınırlara sahiptir — düşük frekanslı (15dk+) bir bot için fazlasıyla yeterlidir, ama proje büyürse (çok sayıda asset/config) bu sınırlar izlenmelidir.
- Binance public kline endpoint'i genelde tarayıcıdan da (CORS) erişilebilir, ama ana bot döngüsü güvenilirlik için her zaman Edge Function (sunucu tarafı) üzerinden çalışmalı — kullanıcı sayfayı kapatsa bile bot çalışmaya devam etmeli.
