import { Kline } from './binance.ts';
import { calculateEMA } from './indicators/ema.ts';
import { calculateRSI } from './indicators/rsi.ts';
import { calculateVolumeProfile } from './indicators/volumeProfile.ts';

export function generateSignal(
  klines: Kline[],
  enabledIndicators: string[],
  params: any,
  minConfluenceScore: number
): { direction: 'long' | 'short' | 'neutral', score: number, reasons: string[] } {
  if (klines.length < Math.max(params.ema_slow || 26, params.rsi_period || 14)) {
    return { direction: 'neutral', score: 0, reasons: ["Not enough data"] };
  }

  const closePrices = klines.map(k => k.close);
  const currentPrice = closePrices[closePrices.length - 1];
  
  let longScore = 0;
  let shortScore = 0;
  const reasons: string[] = [];

  // 1. EMA
  if (enabledIndicators.includes('ema')) {
    const fastPeriod = params.ema_fast || 12;
    const slowPeriod = params.ema_slow || 26;
    const emaFast = calculateEMA(closePrices, fastPeriod);
    const emaSlow = calculateEMA(closePrices, slowPeriod);
    
    const currentFast = emaFast[emaFast.length - 1];
    const currentSlow = emaSlow[emaSlow.length - 1];
    
    if (currentFast > currentSlow && currentPrice > currentFast) {
      longScore++;
      reasons.push(`EMA trend up (Fast > Slow and Price > Fast)`);
    } else if (currentFast < currentSlow && currentPrice < currentFast) {
      shortScore++;
      reasons.push(`EMA trend down (Fast < Slow and Price < Fast)`);
    }
  }

  // 2. RSI
  if (enabledIndicators.includes('rsi')) {
    const rsiPeriod = params.rsi_period || 14;
    const rsi = calculateRSI(closePrices, rsiPeriod);
    const currentRSI = rsi[rsi.length - 1];
    
    // Simple logic: RSI < 30 is oversold (long), > 70 is overbought (short) 
    // Or trend following: RSI > 50 for long, < 50 for short. Let's use trend following.
    if (currentRSI > 50 && currentRSI < 70) {
      longScore++;
      reasons.push(`RSI (${currentRSI.toFixed(1)}) > 50 (Bullish Momentum)`);
    } else if (currentRSI < 50 && currentRSI > 30) {
      shortScore++;
      reasons.push(`RSI (${currentRSI.toFixed(1)}) < 50 (Bearish Momentum)`);
    }
  }

  // 3. Volume Profile
  if (enabledIndicators.includes('volume_profile')) {
    const vpData = klines.map(k => ({ high: k.high, low: k.low, volume: k.volume }));
    // Use last 100 candles for VP
    const vp = calculateVolumeProfile(vpData.slice(-100));
    
    if (currentPrice > vp.poc && currentPrice > vp.vah) {
       longScore++;
       reasons.push(`Price above Volume POC and VAH (Support)`);
    } else if (currentPrice < vp.poc && currentPrice < vp.val) {
       shortScore++;
       reasons.push(`Price below Volume POC and VAL (Resistance)`);
    }
  }

  // Evaluate Confluence
  if (longScore >= minConfluenceScore && longScore > shortScore) {
    return { direction: 'long', score: longScore, reasons };
  } else if (shortScore >= minConfluenceScore && shortScore > longScore) {
    return { direction: 'short', score: shortScore, reasons };
  }

  return { direction: 'neutral', score: Math.max(longScore, shortScore), reasons: [...reasons, "Not enough confluence"] };
}
