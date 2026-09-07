import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchKlines } from '../run-bot-cycle/binance.ts';
import { generateSignal } from '../run-bot-cycle/signalEngine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const configId = String(body?.config_id ?? '');
    if (!configId) throw new Error('config_id gerekli');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: config, error: configError } = await supabase
      .from('bot_config')
      .select('*')
      .eq('id', configId)
      .eq('is_active', true)
      .single();
    if (configError) throw configError;

    const klines = await fetchKlines(config.symbol, config.timeframe, 100);
    const closedKlines = klines.slice(0, -1);
    const lastClosedCandle = closedKlines[closedKlines.length - 1];
    if (!lastClosedCandle) throw new Error('Kapalı mum verisi bulunamadı');

    const signal = generateSignal(
      closedKlines,
      config.enabled_indicators as string[],
      config.indicator_params as Record<string, number>,
      config.min_confluence_score
    );

    const { data: existingSignal, error: existingError } = await supabase
      .from('signals')
      .select('id')
      .eq('config_id', config.id)
      .eq('candle_open_time', lastClosedCandle.openTime)
      .maybeSingle();
    if (existingError) throw existingError;

    return new Response(JSON.stringify({
      success: true,
      configId: config.id,
      symbol: config.symbol,
      signal,
      candleOpenTime: lastClosedCandle.openTime,
      alreadyRecorded: Boolean(existingSignal),
      slMultiplier: config.sl_atr_multiplier,
      tpMultiplier: config.tp_atr_multiplier,
      leverage: config.leverage || 5,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
