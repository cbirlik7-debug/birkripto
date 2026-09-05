// EMA (Exponential Moving Average) - Pure function
export function computeEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export interface EMAResult {
  fast: number;
  slow: number;
  trend: 'up' | 'down' | 'neutral';
}

export function getEMASignal(closes: number[], fastPeriod: number, slowPeriod: number): EMAResult | null {
  const fast = computeEMA(closes, fastPeriod);
  const slow = computeEMA(closes, slowPeriod);
  if (!fast.length || !slow.length) return null;
  const lastFast = fast[fast.length - 1];
  const lastSlow = slow[slow.length - 1];
  return {
    fast: lastFast,
    slow: lastSlow,
    trend: lastFast > lastSlow ? 'up' : lastFast < lastSlow ? 'down' : 'neutral',
  };
}
