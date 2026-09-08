# BirKripto Yapılacaklar

## Tamamlanan İlk Adım

- [x] Bot endpoint'ine `BOT_WEBHOOK_SECRET` doğrulaması eklendi.
- [x] GitHub Actions workflow'u özel webhook secret gönderiyor.
- [x] Dashboard'daki herkese açık bot çalıştırma çağrısı kaldırıldı.
- [x] Açık mum yerine son kapanmış mum işleniyor.
- [x] Aynı config ve mum için tekrar sinyal yazılmasını önleyen unique index eklendi.
- [x] Frontend production build doğrulandı.
- [x] Settings güncellemeleri kontrollü RPC arkasına taşındı.
- [x] Manuel pozisyon açma/kapama işlemleri atomik RPC arkasına taşındı.
- [x] `bot_config`, pozisyon, trade, hesap ve equity tablolarındaki anon yazma izinleri migration ile kaldırıldı.
- [x] Dashboard'a backend tabanlı anlık sinyal kontrolü eklendi.
- [x] Uygun LONG/SHORT sinyalini onaylayarak anlık paper pozisyon açma eklendi.
- [x] Sinyal kaydı ile paper engine işleme durumu `processed_at` alanıyla ayrıldı.
- [x] Açık pozisyonlar için 5 dakikalık SL/TP monitor Edge Function'ı eklendi.
- [x] Günlük zarar, ardışık zarar, maksimum açık pozisyon ve cooldown risk korumaları eklendi.
- [x] `0012`, `0013` ve `0014_ai_pilot.sql` migration'ları canlı Supabase veritabanında çalıştırıldı.
- [x] **Aİ Pilot** sayfası oluşturuldu ve yerel LLM (LM Studio / Ollama) istemcisi entegre edildi.
- [x] AI Online (yeşil) / AI Offline (kırmızı) canlı durum göstergesi ve yerel sunucu bağlantı yönergeleri eklendi.
- [x] Yerel modelden canlı mum/indikatör verileriyle yapılandırılmış trade analizi ve tek tıkla pozisyon açma/yönetme sağlandı.
- [x] Otonom pilot modu (otomatik periyodik tarama ve güven eşikli emir yürütme) eklendi.

## Sıradaki Öncelikler

- [ ] `BOT_WEBHOOK_SECRET` değerini Supabase Edge Function secret'ı olarak ayarla.
- [x] `0004`, `0005`, `0006`, `0007`, `0012`, `0013`, `0014` migration'larını canlı Supabase projesinde çalıştır.
- [ ] Canlı veritabanında anon ile yazma işlemlerinin reddedildiğini doğrula.
- [ ] Aynı mum için yarış durumlarını transaction/upsert ile tamamen atomik hale getir.
- [ ] Paper engine risk korumaları için ek testler ekle.
- [ ] Bot workflow'u için başarısız çağrı ve log izleme ekle.
- [ ] Recharts güncellemesini ve frontend code splitting'i planla.

## Çalıştırma Kontrolleri

```bash
cd web
npm ci
npm run build
```

Bot deploy sonrası manuel workflow çalıştırılmadan önce GitHub Actions secret'larının ve Supabase Function secret'ının aynı değeri kullandığı doğrulanmalı.

