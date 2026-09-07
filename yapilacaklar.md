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

## Sıradaki Öncelikler

- [ ] `BOT_WEBHOOK_SECRET` değerini Supabase Edge Function secret'ı olarak ayarla.
- [ ] `0004_bot_cycle_idempotency.sql` migration'ını canlı Supabase projesinde çalıştır.
- [x] `0005` ve `0006` migration'larını canlı Supabase projesinde çalıştır.
- [x] `0007_signal_processing_state.sql` migration'ını canlı Supabase projesinde çalıştır.
- [ ] Canlı veritabanında anon ile yazma işlemlerinin reddedildiğini doğrula.
- [ ] Aynı mum için yarış durumlarını transaction/upsert ile tamamen atomik hale getir.
- [ ] İndikatör, sinyal ve paper engine testleri ekle.
- [ ] Bot workflow'u için başarısız çağrı ve log izleme ekle.
- [ ] `strategy_suggestions` tablosu ve `suggest-strategy` Edge Function geliştir.
- [ ] LLM önerileri için kabul/reddetme akışı ekle.
- [ ] Recharts güncellemesini ve frontend code splitting'i planla.

## Çalıştırma Kontrolleri

```bash
cd web
npm ci
npm run build
```

Bot deploy sonrası manuel workflow çalıştırılmadan önce GitHub Actions secret'larının ve Supabase Function secret'ının aynı değeri kullandığı doğrulanmalı.