import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-webhook-secret',
};

interface OpenPosition {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  entry_price: number;
  size: number;
  stop_loss: number;
  take_profit: number;
}

async function fetchPrice(symbol: string): Promise<number> {
  const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
  if (!response.ok) throw new Error(`Binance ticker error: ${response.status}`);
  const data = await response.json();
  const price = Number(data.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Geçersiz ${symbol} fiyatı`);
  return price;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const expectedWebhookSecret = Deno.env.get('BOT_WEBHOOK_SECRET');
  const providedWebhookSecret = req.headers.get('x-bot-webhook-secret');
  if (!expectedWebhookSecret || providedWebhookSecret !== expectedWebhookSecret) {
    return new Response(JSON.stringify({ error: 'Yetkisiz monitor çağrısı' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: positions, error: positionsError } = await supabase
      .from('positions')
      .select('id, symbol, direction, entry_price, size, stop_loss, take_profit')
      .eq('status', 'open');
    if (positionsError) throw positionsError;

    const prices = new Map<string, number>();
    const results = [];
    for (const position of (positions ?? []) as OpenPosition[]) {
      if (!prices.has(position.symbol)) prices.set(position.symbol, await fetchPrice(position.symbol));
      const price = prices.get(position.symbol)!;
      const hitStop = position.direction === 'long'
        ? price <= position.stop_loss
        : price >= position.stop_loss;
      const hitTarget = position.direction === 'long'
        ? price >= position.take_profit
        : price <= position.take_profit;

      if (!hitStop && !hitTarget) {
        results.push({ symbol: position.symbol, positionId: position.id, price, action: 'hold' });
        continue;
      }

      const exitReason = hitStop ? 'stop_loss' : 'take_profit';
      const exitPrice = exitReason === 'stop_loss' ? position.stop_loss : position.take_profit;
      const { data: closeResult, error: closeError } = await supabase.rpc('close_monitored_position', {
        p_position_id: position.id,
        p_exit_price: exitPrice,
        p_exit_reason: exitReason,
      });
      if (closeError) throw closeError;
      results.push({ symbol: position.symbol, positionId: position.id, price, action: 'closed', exitReason, closeResult });
    }

    return new Response(JSON.stringify({ success: true, checked: positions?.length ?? 0, results, timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
