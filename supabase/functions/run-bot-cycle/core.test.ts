import { computeEMA, getEMASignal } from './indicators/ema.ts';
import { computeRSI, getRSISignal } from './indicators/rsi.ts';
import { computeATR, getATRSignal } from './indicators/atr.ts';
import { getVolumeProfileSignal } from './indicators/volumeProfile.ts';
import { generateSignal } from './signalEngine.ts';
import type { Kline } from './binance.ts';

const rising = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
const bullish = [100, 99, 100, 101, 100, 101, 102];
const falling = [100, 101, 102, 103, 102, 101, 100];

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}

Deno.test('EMA returns empty when there are not enough values', () => {
  expectEqual(computeEMA([1, 2, 3], 5).length, 0);
});

Deno.test('EMA detects a rising trend', () => {
  const result = getEMASignal(rising, 3, 5);
  expect(result !== null, 'EMA result should exist');
  expectEqual(result.trend, 'up');
  expect(result.fast > result.slow, 'Fast EMA should be above slow EMA');
});

Deno.test('RSI identifies bullish momentum', () => {
  const result = getRSISignal(bullish, 3);
  expect(result !== null, 'RSI result should exist');
  expectEqual(result.momentum, 'bullish');
  expect(result.value > 50, 'RSI should be above 50');
});

Deno.test('RSI identifies bearish momentum', () => {
  const result = getRSISignal(falling, 3);
  expect(result !== null, 'RSI result should exist');
  expectEqual(result.momentum, 'bearish');
  expect(result.value < 50, 'RSI should be below 50');
});

Deno.test('ATR uses true range and rejects insufficient input', () => {
  expectEqual(computeATR([1, 2], [0, 1], [0.5, 1.5], 3).length, 0);
  const result = getATRSignal(
    [10.2, 10.2, 10.2, 10.2, 10.2, 10.2],
    [9.8, 9.8, 9.8, 9.8, 9.8, 9.8],
    [10, 10.01, 10.02, 10.01, 10.02, 10.01],
    3,
  );
  expect(result !== null, 'ATR result should exist');
  expect(result.value > 0, 'ATR should be positive');
  expectEqual(result.volatilityOk, true);
});

Deno.test('Volume Profile returns a position for valid candles', () => {
  const highs = rising.map((value) => value + 1);
  const lows = rising.map((value) => value - 1);
  const volumes = rising.map((_, index) => index + 1);
  const result = getVolumeProfileSignal(rising, lows, rising, volumes, 5);
  expect(result !== null, 'Volume Profile result should exist');
  expectEqual(result.position, 'above_poc');
  expect(result.vah > result.val, 'VAH should be above VAL');
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
  expectEqual(result.direction, 'long');
  expect(result.score > 0, 'Signal score should be positive');
  expectEqual(result.price, 109);
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
  expectEqual(result.direction, 'neutral');
});
