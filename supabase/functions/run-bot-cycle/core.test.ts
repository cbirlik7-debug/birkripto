import { assert, assertEquals, assertGreater, assertLess } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeEMA, getEMASignal } from './indicators/ema.ts';
import { computeRSI, getRSISignal } from './indicators/rsi.ts';
import { computeATR, getATRSignal } from './indicators/atr.ts';
import { getVolumeProfileSignal } from './indicators/volumeProfile.ts';
import { generateSignal } from './signalEngine.ts';
import type { Kline } from './binance.ts';

const rising = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
const falling = [...rising].reverse();

Deno.test('EMA returns empty when there are not enough values', () => {
  assertEquals(computeEMA([1, 2, 3], 5), []);
});

Deno.test('EMA detects a rising trend', () => {
  const result = getEMASignal(rising, 3, 5);
  assert(result !== null);
  assertEquals(result.trend, 'up');
  assertGreater(result.fast, result.slow);
});

Deno.test('RSI identifies bullish momentum', () => {
  const result = getRSISignal(rising, 3);
  assert(result !== null);
  assertEquals(result.momentum, 'bullish');
  assertGreater(result.value, 50);
});

Deno.test('RSI identifies bearish momentum', () => {
  const result = getRSISignal(falling, 3);
  assert(result !== null);
  assertEquals(result.momentum, 'bearish');
  assertLess(result.value, 50);
});

Deno.test('ATR uses true range and rejects insufficient input', () => {
  assertEquals(computeATR([1, 2], [0, 1], [0.5, 1.5], 3), []);
  const result = getATRSignal(
    [11, 12, 13, 14, 15, 16],
    [9, 10, 11, 12, 13, 14],
    [10, 11, 12, 13, 14, 15],
    3,
  );
  assert(result !== null);
  assertGreater(result.value, 0);
  assertEquals(result.volatilityOk, true);
});

Deno.test('Volume Profile returns a position for valid candles', () => {
  const highs = rising.map((value) => value + 1);
  const lows = rising.map((value) => value - 1);
  const volumes = rising.map((_, index) => index + 1);
  const result = getVolumeProfileSignal(rising, lows, rising, volumes, 5);
  assert(result !== null);
  assertEquals(result.position, 'above_poc');
  assertGreater(result.vah, result.val);
});

Deno.test('Signal engine produces a long signal when EMA confirms', () => {
  const klines: Kline[] = rising.map((close, index) => ({
    openTime: index,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100 + index,
    closeTime: index + 1,
  }));
  const result = generateSignal(klines, ['ema'], { ema_fast: 3, ema_slow: 5 }, 1);
  assertEquals(result.direction, 'long');
  assertGreater(result.score, 0);
  assertEquals(result.price, 109);
});

Deno.test('Signal engine stays neutral when no indicator reaches the threshold', () => {
  const klines: Kline[] = rising.map((close, index) => ({
    openTime: index,
    open: close,
    high: close + 0.1,
    low: close - 0.1,
    close,
    volume: 100,
    closeTime: index + 1,
  }));
  const result = generateSignal(klines, ['ema'], { ema_fast: 3, ema_slow: 5 }, 2);
  assertEquals(result.direction, 'neutral');
});
