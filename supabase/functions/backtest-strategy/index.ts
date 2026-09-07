import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchKlines, type Kline } from '../run-bot-cycle/binance.ts';
import { generateSignal } from '../run-bot-cycle/signalEngine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BacktestTrade {
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  exitReason: string;
  openedAt: number;
  closedAt: number;
}

function runBacktest(config: any, candles: Kline[]): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  let position: { direction: 'long' | 'short'; entryPrice: number; stopLoss: number; takeProfit: number; openedAt: number } | null = null;

  for (let index = 100; index < candles.length; index++) {
    const window = candles.slice(0, index);
    const signal = generateSignal(window, config.enabled_indicators, config.indicator_params, config.min_confluence_score);
    const candle = candles[index];

    if (position) {
      let exitPrice = 0;
      let exitReason = '';
      if (position.direction === 'long') {
        if (candle.low <= position.stopLoss) { exitPrice = position.stopLoss; exitReason = 'stop_loss'; }
        else if (candle.high >= position.takeProfit) { exitPrice = position.takeProfit; exitReason = 'take_profit'; }
        else if (signal.direction === 'short') { exitPrice = candle.close; exitReason = 'reverse_signal'; }
      } else {
        if (candle.high >= position.stopLoss) { exitPrice = position.stopLoss; exitReason = 'stop_loss'; }
        else if (candle.low <= position.takeProfit) { exitPrice = position.takeProfit; exitReason = 'take_profit'; }
        else if (signal.direction === 'long') { exitPrice = candle.close; exitReason = 'reverse_signal'; }
      }
      if (exitReason) {
        const rawPnlPct = position.direction === 'long'
          ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
        trades.push({
          direction: position.direction,
          entryPrice: position.entryPrice,
          exitPrice,
          pnl: rawPnlPct,
          pnlPct: rawPnlPct,
          exitReason,
          openedAt: position.openedAt,
          closedAt: candle.closeTime,
        });
        position = null;
      }
    }

    if (!position && signal.direction !== 'neutral' && signal.atrValue > 0) {
      const stopDistance = signal.atrValue * config.sl_atr_multiplier;
      const targetDistance = signal.atrValue * config.tp_atr_multiplier;
      position = {
        direction: signal.direction,
        entryPrice: candle.close,
        stopLoss: signal.direction === 'long' ? candle.close - stopDistance : candle.close + stopDistance,
        takeProfit: signal.direction === 'long' ? candle.close + targetDistance : candle.close - targetDistance,
        openedAt: candle.closeTime,
      };
    }
  }

  return trades;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { config_id: configId, limit = 500 } = await req.json();
    if (!configId) throw new Error('config_id gerekli');
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: config, error: configError } = await supabase.from('bot_config').select('*').eq('id', configId).single();
    if (configError) throw configError;
    const candles = await fetchKlines(config.symbol, config.timeframe, Math.min(Number(limit), 1000));
    const trades = runBacktest(config, candles);
    const wins = trades.filter((trade) => trade.pnl > 0).length;
    const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;
    for (const trade of trades) {
      equity += trade.pnl;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
    }
    return new Response(JSON.stringify({
      success: true,
      symbol: config.symbol,
      timeframe: config.timeframe,
      candleCount: candles.length,
      trades,
      metrics: {
        totalTrades: trades.length,
        winRate: trades.length ? (wins / trades.length) * 100 : 0,
        totalPnl,
        maxDrawdown,
        profitFactor: (() => {
          const grossProfit = trades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
          const grossLoss = Math.abs(trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0));
          return grossLoss ? grossProfit / grossLoss : grossProfit > 0 ? null : 0;
        })(),
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
