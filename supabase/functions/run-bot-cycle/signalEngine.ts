import { getEMASignal } from './indicators/ema.ts';
import { getRSISignal } from './indicators/rsi.ts';
import { getATRSignal } from './indicators/atr.ts';
import { getVolumeProfileSignal } from './indicators/volumeProfile.ts';
import type { Kline } from './binance.ts';

export interface Signal {
  direction: 'long' | 'short' | 'neutral';
  score: number;
  reasons: string[];
  price: number;
  atrValue: number;
}

export function generateSignal(
  klines: Kline[],
  enabledIndicators: string[],
  params: Record<string, number>,
  minScore: number
): Signal {
  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const volumes = klines.map((k) => k.volume);
  const price = closes[closes.length - 1];

  let longScore = 0;
  let shortScore = 0;
  const reasons: string[] = [];
  let atrValue = 0;
  let totalCriteria = 0;

  // EMA
  if (enabledIndicators.includes('ema')) {
    totalCriteria++;
    const ema = getEMASignal(closes, params.ema_fast ?? 12, params.ema_slow ?? 26);
    if (ema) {
      if (ema.trend === 'up') { longScore++; reasons.push(`EMA trend yukarı (hızlı ${ema.fast.toFixed(2)} > yavaş ${ema.slow.toFixed(2)})`); }
      else if (ema.trend === 'down') { shortScore++; reasons.push(`EMA trend aşağı (hızlı ${ema.fast.toFixed(2)} < yavaş ${ema.slow.toFixed(2)})`); }
    }
  }

  // RSI
  if (enabledIndicators.includes('rsi')) {
    totalCriteria++;
    const rsi = getRSISignal(closes, params.rsi_period ?? 14);
    if (rsi) {
      if (rsi.momentum === 'bullish') { longScore++; reasons.push(`RSI yükselen momentum (${rsi.value.toFixed(1)})`); }
      else if (rsi.momentum === 'bearish') { shortScore++; reasons.push(`RSI düşen momentum (${rsi.value.toFixed(1)})`); }
    }
  }

  // ATR (volatilite filtresi)
  if (enabledIndicators.includes('atr')) {
    totalCriteria++;
    const atr = getATRSignal(highs, lows, closes, params.atr_period ?? 14);
    if (atr) {
      atrValue = atr.value;
      if (atr.volatilityOk) {
        longScore += 0.5; shortScore += 0.5; // her iki yönde de geçerli filtre
        reasons.push(`ATR volatilite uygun (${atr.value.toFixed(2)})`);
      } else {
        reasons.push(`ATR yüksek volatilite - filtre devrede (${atr.value.toFixed(2)})`);
      }
    }
  }

  // Volume Profile
  if (enabledIndicators.includes('volume_profile')) {
    totalCriteria++;
    const vp = getVolumeProfileSignal(highs, lows, closes, volumes, params.volume_profile_bins ?? 24);
    if (vp) {
      if (vp.position === 'above_poc') { longScore++; reasons.push(`Fiyat POC üzerinde (POC: ${vp.poc.toFixed(2)}, VAH: ${vp.vah.toFixed(2)})`); }
      else if (vp.position === 'below_poc') { shortScore++; reasons.push(`Fiyat POC altında (POC: ${vp.poc.toFixed(2)}, VAL: ${vp.val.toFixed(2)})`); }
    }
  }

  const direction = longScore >= minScore && longScore > shortScore
    ? 'long'
    : shortScore >= minScore && shortScore > longScore
    ? 'short'
    : 'neutral';

  return {
    direction,
    score: Math.max(longScore, shortScore),
    reasons,
    price,
    atrValue,
  };
}
