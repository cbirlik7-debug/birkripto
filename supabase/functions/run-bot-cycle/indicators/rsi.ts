// RSI (Relative Strength Index) - Wilder Smoothing
export function computeRSI(closes: number[], period: number): number[] {
  if (closes.length < period + 1) return [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: number[] = [];
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + rs));
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs2));
  }
  return result;
}

export interface RSIResult {
  value: number;
  momentum: 'bullish' | 'bearish' | 'neutral';
}

export function getRSISignal(closes: number[], period: number): RSIResult | null {
  const rsi = computeRSI(closes, period);
  if (!rsi.length) return null;
  const value = rsi[rsi.length - 1];
  const prev = rsi.length > 1 ? rsi[rsi.length - 2] : value;
  return {
    value,
    momentum: value > 50 && value > prev ? 'bullish' : value < 50 && value < prev ? 'bearish' : 'neutral',
  };
}
