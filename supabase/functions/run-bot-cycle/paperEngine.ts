export interface Position {
  id: string;
  config_id: string;
  symbol: string;
  direction: 'long' | 'short';
  entry_price: number;
  size: number;
  stop_loss: number;
  take_profit: number;
}

export function calculatePositionSize(balance: number, riskPct: number, entryPrice: number, stopLoss: number): number {
  const riskAmount = balance * (riskPct / 100);
  const priceRisk = Math.abs(entryPrice - stopLoss);
  if (priceRisk === 0) return 0;
  return riskAmount / priceRisk;
}

export function checkSLTP(position: Position, currentHigh: number, currentLow: number): 'stop_loss' | 'take_profit' | null {
  if (position.direction === 'long') {
    // Check Stop Loss first (worst case scenario within the candle)
    if (currentLow <= position.stop_loss) return 'stop_loss';
    if (currentHigh >= position.take_profit) return 'take_profit';
  } else {
    if (currentHigh >= position.stop_loss) return 'stop_loss';
    if (currentLow <= position.take_profit) return 'take_profit';
  }
  return null;
}

export function calculatePnL(position: Position, exitPrice: number, commissionPct: number): { pnl: number, pnlPct: number, commission: number } {
  const isLong = position.direction === 'long';
  const priceDiff = isLong ? (exitPrice - position.entry_price) : (position.entry_price - exitPrice);
  
  const grossPnL = priceDiff * position.size;
  const entryValue = position.entry_price * position.size;
  const exitValue = exitPrice * position.size;
  
  const commission = (entryValue + exitValue) * (commissionPct / 100);
  const netPnL = grossPnL - commission;
  
  const pnlPct = (netPnL / entryValue) * 100;
  
  return { pnl: netPnL, pnlPct, commission };
}
