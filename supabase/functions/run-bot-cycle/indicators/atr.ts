export interface ATRData {
  high: number;
  low: number;
  close: number;
}

export function calculateATR(data: ATRData[], period: number = 14): number[] {
  if (data.length <= period) return new Array(data.length).fill(NaN);
  
  const atr: number[] = new Array(period).fill(NaN);
  
  const tr = (i: number) => {
    const currentHigh = data[i].high;
    const currentLow = data[i].low;
    const previousClose = data[i - 1].close;
    
    return Math.max(
      currentHigh - currentLow,
      Math.abs(currentHigh - previousClose),
      Math.abs(currentLow - previousClose)
    );
  };
  
  // Calculate first ATR (simple average of TRs)
  let trSum = 0;
  for (let i = 1; i <= period; i++) {
    trSum += tr(i);
  }
  
  let currentAtr = trSum / period;
  atr.push(currentAtr);
  
  // Calculate smoothed ATR for the rest
  for (let i = period + 1; i < data.length; i++) {
    currentAtr = ((currentAtr * (period - 1)) + tr(i)) / period;
    atr.push(currentAtr);
  }
  
  return atr;
}
