// ATR (Average True Range) - Wilder Smoothing
export function computeATR(highs: number[], lows: number[], closes: number[], period: number): number[] {
  if (highs.length < period + 1) return [];
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trs.push(Math.max(hl, hc, lc));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: number[] = [atr];
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result.push(atr);
  }
  return result;
}

export interface ATRResult {
  value: number;
  volatilityOk: boolean; // false = aşırı volatil (işlem açma)
}

export function getATRSignal(highs: number[], lows: number[], closes: number[], period: number): ATRResult | null {
  const atr = computeATR(highs, lows, closes, period);
  if (!atr.length) return null;
  const value = atr[atr.length - 1];
  const lastClose = closes[closes.length - 1];
  const atrPct = (value / lastClose) * 100;
  return { value, volatilityOk: atrPct < 5 }; // >%5 aşırı volatil
}
