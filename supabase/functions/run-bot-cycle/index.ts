import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchKlines } from './binance.ts';
import { generateSignal } from './signalEngine.ts';
import { runPaperEngine } from './paperEngine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const expectedWebhookSecret = Deno.env.get('BOT_WEBHOOK_SECRET');
  const providedWebhookSecret = req.headers.get('x-bot-webhook-secret');
  if (!expectedWebhookSecret) {
    return new Response(JSON.stringify({ error: 'BOT_WEBHOOK_SECRET yapılandırılmamış' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!providedWebhookSecret || providedWebhookSecret !== expectedWebhookSecret) {
    return new Response(JSON.stringify({ error: 'Yetkisiz bot çağrısı' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Aktif tüm config'leri al
    const { data: configs, error } = await supabase
      .from('bot_config')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: 'Aktif config bulunamadı' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    for (const cfg of configs) {
      try {
        // Binance'ten kline verisi çek (100 mum)
        const klines = await fetchKlines(cfg.symbol, cfg.timeframe, 100);
        const closedKlines = klines.slice(0, -1);
        const lastClosedCandle = closedKlines[closedKlines.length - 1];
        if (!lastClosedCandle) throw new Error('Kapalı mum verisi bulunamadı');

        const { data: existingSignal, error: existingSignalError } = await supabase
          .from('signals')
          .select('id, processed_at')
          .eq('config_id', cfg.id)
          .eq('candle_open_time', lastClosedCandle.openTime)
          .maybeSingle();
        if (existingSignalError) throw existingSignalError;
        if (existingSignal?.processed_at) {
          results.push({ symbol: cfg.symbol, skipped: true, candleOpenTime: lastClosedCandle.openTime });
          continue;
        }

        // Sinyal üret
        const signal = generateSignal(
          closedKlines,
          cfg.enabled_indicators as string[],
          cfg.indicator_params as Record<string, number>,
          cfg.min_confluence_score
        );

        // Sinyali veritabanına kaydet
        if (existingSignal) {
          const { error: updateSignalError } = await supabase
            .from('signals')
            .update({
              direction: signal.direction,
              score: Math.round(signal.score),
              price: signal.price,
              reasons: signal.reasons,
            })
            .eq('id', existingSignal.id);
          if (updateSignalError) throw updateSignalError;
        } else {
          const { error: insertSignalError } = await supabase.from('signals').insert({
            config_id: cfg.id,
            symbol: cfg.symbol,
            direction: signal.direction,
            score: Math.round(signal.score),
            price: signal.price,
            reasons: signal.reasons,
            candle_open_time: lastClosedCandle.openTime,
          });
          if (insertSignalError) throw insertSignalError;
        }

        // Paper trading simülasyonu
        await runPaperEngine(
          supabase,
          cfg.id,
          signal,
          cfg.symbol,
          cfg.sl_atr_multiplier,
          cfg.tp_atr_multiplier,
          cfg.risk_per_trade_pct,
          cfg.commission_pct,
          cfg.leverage || 5
        );

        const { error: markProcessedError } = await supabase
          .from('signals')
          .update({ processed_at: new Date().toISOString() })
          .eq('config_id', cfg.id)
          .eq('candle_open_time', lastClosedCandle.openTime);
        if (markProcessedError) throw markProcessedError;

        results.push({
          symbol: cfg.symbol,
          signal: signal.direction,
          score: signal.score,
          price: signal.price,
        });
      } catch (err) {
        console.error(`${cfg.symbol} hatası:`, err);
        results.push({ symbol: cfg.symbol, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ success: true, results, timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
