# BirKripto Uygulama Özeti

## Mevcut Durum

- Proje React + Vite + TypeScript frontend ve Supabase Edge Function backend kullanıyor.
- Frontend GitHub Pages üzerinde yayınlanıyor:
  `https://cbirlik7-debug.github.io/birkripto/`
- GitHub Pages adresi şu anda çalışıyor ve `HTTP 200` dönüyor.
- `main` dalı ile `origin/main` aynı committe.
- Frontend üretim build'i başarılı:
  `cd web && npm ci && npm run build`
- GitHub Pages için Vite base ayarı doğru:
  `/birkripto/`

## Mimari

```text
GitHub Actions cron
        |
        v
Supabase Edge Function: run-bot-cycle
        |
        v
Supabase PostgreSQL
        |
        v
GitHub Pages üzerinde React dashboard
```

Bot döngüsü yaklaşık her 15 dakikada bir çalışıyor. Binance verileri alınarak sinyal üretiliyor ve paper trading kayıtları Supabase'e yazılıyor.

## Dağıtım

- `deploy-pages.yml`, `web/` değişikliklerinde frontend'i build edip `gh-pages` dalına yayınlıyor.
- `run-bot-cycle.yml`, GitHub Actions cron ile Edge Function'ı çağırıyor.
- Son kaynak commit'i backend tarafındaki komisyon hesabı düzeltmesiyle ilgili. Bu nedenle frontend için yeni Pages deploy'u gerekmemiş.
- Supabase Edge Function başarıyla deploy edilmiş.
- Frontend ortam değişkenleri GitHub Secrets üzerinden build sırasında veriliyor.
- `web/.env` Git tarafından izlenmiyor; bu doğru.

## En Önemli Güvenlik Riski: RLS

Supabase migration dosyalarında `anon` rolüne birçok tabloda şu tür izinler verilmiş:

```sql
FOR ALL TO anon USING (true) WITH CHECK (true)
```

Bu, public frontend'i kullanan herhangi bir kişinin anon key ile şunları yapabilmesi anlamına geliyor:

- Bakiyeleri değiştirmek
- Pozisyon ve trade eklemek, değiştirmek veya silmek
- Sinyal ve equity kayıtlarını manipüle etmek
- Bot ayarlarını değiştirmek

Bu gerçek para riski oluşturmuyor çünkü sistem paper trading kullanıyor. Ancak verilerin güvenilirliği ve sonuçların doğruluğu açısından ciddi bir problem.

## İkinci Güvenlik Riski: Bot Endpoint'i

`run-bot-cycle` Edge Function kodu gelen isteğin gerçekten GitHub Actions'tan gelip gelmediğini doğrulamıyor.

Workflow içinde `service_role` header gönderiliyor, ancak fonksiyon tarafında bu header kontrol edilmiyor. Bu nedenle endpoint dışarıdan çağrılabiliyorsa biri:

- Bot döngüsünü tekrar tekrar çalıştırabilir
- Gereksiz Binance istekleri oluşturabilir
- Veritabanına fazla kayıt yazabilir
- Paper trading durumunu beklenmedik şekilde değiştirebilir

Öneri: Bot çağrısını kimlik doğrulamalı hale getirmek ve fonksiyon içinde ayrı bir gizli webhook token'ı doğrulamak.

## Terminal ve Git Notları

Açıklamayı Git komutuyla aynı satıra yazmak zsh üzerinde sorun çıkardı:

```bash
git checkout main # açıklama
```

Shell bu metni komuta parametre gibi iletti. Doğru kullanım:

```bash
# açıklama
git checkout main
```

Frontend build komutu kök dizinde değil, `web/` dizininde çalıştırılmalı:

```bash
cd /Users/canb7/Desktop/birkripto/web
npm ci
npm run build
```

## Terminal Güvenliği

Supabase CLI giriş bağlantısı ve doğrulama kodu terminal geçmişinde paylaşıldı. Bunlar gizli erişim bilgisi gibi değerlendirilmelidir.

Öneri:

1. Supabase CLI oturumunu revoke/logout et.
2. Yeni bir CLI oturumu aç.
3. Login bağlantısı, doğrulama kodu veya token bilgisini sohbetlerde ve commit'lerde paylaşma.
4. `service_role` anahtarını hiçbir zaman frontend'e veya GitHub Pages çıktısına koyma.

## Build Uyarıları

Build başarılı olsa da şu uyarılar görüldü:

- 2 adet orta seviye npm audit uyarısı
- `recharts` sürümü artık aktif olarak desteklenmiyor
- Üretim JavaScript bundle'ı yaklaşık 850 KB

Bunlar şu an yayını engellemiyor. İleride bağımlılık güncellemesi ve code splitting yapılabilir.

## Önerilen Öncelik Sırası

1. Anon kullanıcı için yazma izinlerini kaldır veya daralt.
2. Paper trading yazma işlemlerini Edge Function arkasına taşı.
3. `run-bot-cycle` çağrısına gerçek kimlik doğrulama ekle.
4. Supabase CLI oturumunu yenile.
5. npm audit uyarılarını ve Recharts güncellemesini planla.
6. Gerekirse frontend bundle'ını code splitting ile küçült.

## Genel Sonuç

Uygulama yayınlanmış ve temel frontend/backend akışı çalışıyor. GitHub Pages yapılandırması doğru. En önemli geliştirme alanı görünüm değil, veri güvenliği ve bot endpoint'inin korunmasıdır. Mevcut sistem demo ve paper trading için çalışabilir; ancak verilerin güvenilir kabul edilebilmesi için RLS ve Edge Function yetkilendirmesi iyileştirilmelidir.
