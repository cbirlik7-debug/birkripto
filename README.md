# ₿ BirKripto — Paper Trading Bot

Binance verilerini kullanarak long/short sinyalleri üreten, sanal bakiye üzerinde paper trading yapan ve sonuçları web arayüzünde gösteren bir sistem.

## 🏗️ Mimari

```
GitHub Actions (cron) → Supabase Edge Function → Supabase Postgres DB → GitHub Pages (React UI)
```

## 🚀 Kurulum

### 1. Supabase Projesi Oluştur
1. https://supabase.com/ → New project
2. `supabase/migrations/0001_init.sql` içeriğini **SQL Editor**'a yapıştırıp çalıştır
3. **Settings → API** sayfasından `URL` ve `anon key`'i kopyala

### 2. GitHub Secrets Ekle
Repository → **Settings → Secrets and variables → Actions**:
- `SUPABASE_URL` = Supabase URL (ör. `https://xxxx.supabase.co`)
- `SUPABASE_ANON_KEY` = anon/public key
- `SUPABASE_SERVICE_ROLE` = service_role key (gizli!)
- `BOT_WEBHOOK_SECRET` = GitHub Actions'ın bot fonksiyonunu çağırmak için kullandığı ayrı gizli değer

### 3. Supabase Edge Function Deploy Et
```bash
npm install -g supabase
supabase login
supabase functions deploy run-bot-cycle --project-ref <PROJECT_REF>
```

Edge Function secret'ını ayrıca tanımlayın:

```bash
supabase secrets set BOT_WEBHOOK_SECRET=<uzun-rastgele-deger> --project-ref <PROJECT_REF>
```

Veritabanı migration dosyalarını Supabase SQL Editor'da sırayla çalıştırın. `0004_bot_cycle_idempotency.sql` ile `0009_risk_protections.sql` arasındaki migration dosyaları uygulanmalıdır.

### 4. GitHub Pages Aktif Et
Repository → **Settings → Pages** → Source: `gh-pages` branch

### 5. Git Push → Her Şey Otomatik!
```bash
git add .
git commit -m "🚀 İlk kurulum"
git push origin main
```
GitHub Actions otomatik olarak:
- Frontend'i build edip GitHub Pages'a deploy eder
- Her 15 dakikada bot döngüsünü çalıştırır
- Her 5 dakikada açık pozisyonların SL/TP seviyelerini kontrol eder

Dashboard'daki **Sinyali Şimdi Kontrol Et** düğmesi, seçili asset için backend'de yeni sinyal taraması yapar. LONG veya SHORT sinyali oluşursa kullanıcı **Onayla ve Aç** düğmesiyle paper pozisyonu anlık fiyat üzerinden açabilir.

Paper engine yeni pozisyon açmadan önce günlük zarar yüzdesi, ardışık zarar limiti, maksimum açık pozisyon sayısı ve cooldown süresini kontrol eder. Bu sınırlar Settings sayfasından config bazında değiştirilebilir.

## 📁 Yapı
```
birkripto/
├── web/                    # React + Vite + TypeScript frontend
│   └── src/pages/          # Dashboard, Trades, Signals, Strategies, Settings
├── supabase/
│   ├── functions/run-bot-cycle/  # Edge Function (bot mantığı)
│   └── migrations/               # SQL şema
└── .github/workflows/      # CI/CD ve cron
```

## ⚠️ Not
Bu proje yatırım tavsiyesi değildir. Yalnızca strateji test/öğrenme aracıdır.
