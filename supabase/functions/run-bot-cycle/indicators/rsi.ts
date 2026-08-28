export function calculateRSI(data: number[], period: number = 14): number[] {
  if (data.length <= period) return new Array(data.length).fill(NaN);
  
  const rsi: number[] = new Array(period).fill(NaN);
  
  let gains = 0;
  let losses = 0;
  
  // Initial Average Gain/Loss
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  let rs = avgGain / avgLoss;
  rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + rs)));
  
  // Smoothed Moving Average
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    rs = avgGain / avgLoss;
    rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + rs)));
  }
  
  return rsi;
}
