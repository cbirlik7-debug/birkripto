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

        // Sinyal üret
        const signal = generateSignal(
          klines,
          cfg.enabled_indicators as string[],
          cfg.indicator_params as Record<string, number>,
          cfg.min_confluence_score
        );

        // Sinyali veritabanına kaydet
        await supabase.from('signals').insert({
          config_id: cfg.id,
          symbol: cfg.symbol,
          direction: signal.direction,
          score: Math.round(signal.score),
          price: signal.price,
          reasons: signal.reasons,
        });

        // Paper trading simülasyonu
        await runPaperEngine(
          supabase,
          cfg.id,
          signal,
          cfg.symbol,
          cfg.sl_atr_multiplier,
          cfg.tp_atr_multiplier,
          cfg.risk_per_trade_pct,
          cfg.commission_pct
        );

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
