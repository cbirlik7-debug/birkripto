export function calculateEMA(data: number[], period: number): number[] {
  if (data.length < period) return new Array(data.length).fill(NaN);
  
  const result: number[] = [];
  
  // Calculate SMA for the first point
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
    result.push(NaN); // padding for indices 0 to period-2
  }
  
  let ema = sum / period;
  result[period - 1] = ema;
  
  const multiplier = 2 / (period + 1);
  
  // Calculate EMA
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    result.push(ema);
  }
  
  return result;
}
