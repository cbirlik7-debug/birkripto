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

### 3. Supabase Edge Function Deploy Et
```bash
npm install -g supabase
supabase login
supabase functions deploy run-bot-cycle --project-ref <PROJECT_REF>
```

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
