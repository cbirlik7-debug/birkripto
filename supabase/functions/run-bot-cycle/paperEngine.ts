import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { Signal } from './signalEngine.ts';

export async function runPaperEngine(
  supabase: SupabaseClient,
  configId: string,
  signal: Signal,
  symbol: string,
  slMultiplier: number,
  tpMultiplier: number,
  riskPct: number,
  commissionPct: number,
  leverage: number = 5
) {
  // 1. Açık pozisyonları kontrol et
  const { data: openPositions } = await supabase
    .from('positions')
    .select('*')
    .eq('config_id', configId)
    .eq('status', 'open');

  const { data: accountData } = await supabase
    .from('strategy_accounts')
    .select('*')
    .eq('config_id', configId)
    .single();

  if (!accountData) return;
  let balance = accountData.balance;

  // 2. Açık pozisyonları SL/TP veya ters sinyal kontrolü
  for (const pos of openPositions ?? []) {
    let closeReason: string | null = null;
    let exitPrice = signal.price;

    if (pos.direction === 'long') {
      if (signal.price <= pos.stop_loss) { closeReason = 'stop_loss'; exitPrice = pos.stop_loss; }
      else if (signal.price >= pos.take_profit) { closeReason = 'take_profit'; exitPrice = pos.take_profit; }
      else if (signal.direction === 'short') { closeReason = 'reverse_signal'; }
    } else {
      if (signal.price >= pos.stop_loss) { closeReason = 'stop_loss'; exitPrice = pos.stop_loss; }
      else if (signal.price <= pos.take_profit) { closeReason = 'take_profit'; exitPrice = pos.take_profit; }
      else if (signal.direction === 'long') { closeReason = 'reverse_signal'; }
    }

    if (closeReason) {
      const grossPnl = pos.direction === 'long'
        ? (exitPrice - pos.entry_price) * pos.size
        : (pos.entry_price - exitPrice) * pos.size;
      const entryCommission = pos.entry_price * pos.size * (commissionPct / 100);
      const exitCommission = exitPrice * pos.size * (commissionPct / 100);
      const totalCommission = entryCommission + exitCommission;
      const netPnl = grossPnl - totalCommission;
      const pnlPct = (netPnl / accountData.starting_balance) * 100;

      balance += netPnl;

      await supabase.from('trades').insert({
        position_id: pos.id, config_id: configId, symbol,
        direction: pos.direction, entry_price: pos.entry_price, exit_price: exitPrice,
        size: pos.size, pnl: netPnl, pnl_pct: pnlPct,
        commission: totalCommission, leverage: pos.leverage || leverage, exit_reason: closeReason, opened_at: pos.opened_at,
      });

      await supabase.from('positions').update({ status: 'closed' }).eq('id', pos.id);
    }
  }

  // 3. Yeni pozisyon aç (sadece mevcut açık pozisyon yoksa)
  const { count: openCount } = await supabase
    .from('positions').select('id', { count: 'exact', head: true })
    .eq('config_id', configId).eq('status', 'open');

  if ((openCount ?? 0) === 0 && signal.direction !== 'neutral' && signal.atrValue > 0) {
    const riskAmount = balance * (riskPct / 100);
    const slDistance = signal.atrValue * slMultiplier;
    const size = riskAmount / slDistance;
    const stopLoss = signal.direction === 'long'
      ? signal.price - slDistance
      : signal.price + slDistance;
    const takeProfit = signal.direction === 'long'
      ? signal.price + signal.atrValue * tpMultiplier
      : signal.price - signal.atrValue * tpMultiplier;

    await supabase.from('positions').insert({
      config_id: configId, symbol, direction: signal.direction,
      entry_price: signal.price, size, stop_loss: stopLoss, take_profit: takeProfit,
      leverage,
    });
  }

  // 4. Bakiyeyi ve equity snapshot'ı güncelle
  await supabase.from('strategy_accounts')
    .update({ balance, updated_at: new Date().toISOString() })
    .eq('config_id', configId);

  await supabase.from('equity_snapshots').insert({ config_id: configId, balance });
}
