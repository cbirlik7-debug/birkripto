import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchKlines } from './binance.ts'
import { generateSignal } from './signalEngine.ts'
import { calculateATR } from './indicators/atr.ts'
import { riskProfiles } from './riskProfiles.ts'
import { checkSLTP, calculatePnL, calculatePositionSize, Position } from './paperEngine.ts'

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch active configs
    const { data: configs, error: configError } = await supabase
      .from('bot_config')
      .select('*')
      .eq('is_active', true);

    if (configError) throw configError;
    if (!configs || configs.length === 0) return new Response("No active configs", { status: 200 });

    for (const config of configs) {
      // 2. Fetch market data
      const klines = await fetchKlines(config.symbol, config.timeframe, 100);
      if (klines.length === 0) continue;
      
      const currentKline = klines[klines.length - 1];
      const currentPrice = currentKline.close;

      // 3. Check existing positions for SL/TP
      const { data: positions } = await supabase
        .from('positions')
        .select('*')
        .eq('config_id', config.id)
        .eq('status', 'open');

      if (positions && positions.length > 0) {
        for (const pos of positions) {
          const exitReason = checkSLTP(pos as Position, currentKline.high, currentKline.low);
          
          if (exitReason) {
             const exitPrice = exitReason === 'stop_loss' ? pos.stop_loss : pos.take_profit;
             const { pnl, pnlPct, commission } = calculatePnL(pos as Position, exitPrice, config.commission_pct);
             
             // Close position
             await supabase.from('positions').update({ status: 'closed' }).eq('id', pos.id);
             
             // Record trade
             await supabase.from('trades').insert({
               position_id: pos.id,
               config_id: config.id,
               symbol: config.symbol,
               direction: pos.direction,
               entry_price: pos.entry_price,
               exit_price: exitPrice,
               size: pos.size,
               pnl,
               pnl_pct: pnlPct,
               commission,
               exit_reason: exitReason,
               opened_at: pos.opened_at
             });
             
             // Update balance
             const { data: account } = await supabase.from('strategy_accounts').select('balance').eq('config_id', config.id).single();
             if (account) {
                 const newBalance = account.balance + pnl;
                 await supabase.from('strategy_accounts').update({ balance: newBalance, updated_at: new Date() }).eq('config_id', config.id);
                 await supabase.from('equity_snapshots').insert({ config_id: config.id, balance: newBalance });
             }
          }
        }
      }

      // If there are still open positions for this config, we don't open new ones in this simple version
      const { data: remainingOpen } = await supabase.from('positions').select('id').eq('config_id', config.id).eq('status', 'open');
      if (remainingOpen && remainingOpen.length > 0) continue;

      // 4. Generate Signal
      // Determine parameters based on risk level
      const riskLevel = config.risk_level as keyof typeof riskProfiles;
      const profile = riskProfiles[riskLevel] || riskProfiles.medium;
      
      const signal = generateSignal(klines, config.enabled_indicators, config.indicator_params, profile.min_confluence_score);
      
      // Log signal
      await supabase.from('signals').insert({
        config_id: config.id,
        symbol: config.symbol,
        direction: signal.direction,
        score: signal.score,
        price: currentPrice,
        reasons: signal.reasons
      });

      // 5. Open new position if signal is strong enough
      if (signal.direction !== 'neutral') {
          // Calculate ATR for SL/TP
          const atrData = klines.map(k => ({ high: k.high, low: k.low, close: k.close }));
          const atrArr = calculateATR(atrData, 14);
          const currentAtr = atrArr[atrArr.length - 1];
          
          const isLong = signal.direction === 'long';
          const stopLoss = isLong ? currentPrice - (currentAtr * profile.sl_atr_multiplier) : currentPrice + (currentAtr * profile.sl_atr_multiplier);
          const takeProfit = isLong ? currentPrice + (currentAtr * profile.tp_atr_multiplier) : currentPrice - (currentAtr * profile.tp_atr_multiplier);
          
          const { data: account } = await supabase.from('strategy_accounts').select('balance').eq('config_id', config.id).single();
          if (account) {
              const size = calculatePositionSize(account.balance, profile.risk_per_trade_pct, currentPrice, stopLoss);
              if (size > 0) {
                  await supabase.from('positions').insert({
                    config_id: config.id,
                    symbol: config.symbol,
                    direction: signal.direction,
                    entry_price: currentPrice,
                    size,
                    stop_loss: stopLoss,
                    take_profit: takeProfit
                  });
              }
          }
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
})
