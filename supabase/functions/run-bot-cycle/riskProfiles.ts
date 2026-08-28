export const riskProfiles = {
  low: {
    min_confluence_score: 4,
    risk_per_trade_pct: 1,
    sl_atr_multiplier: 1.5,
    tp_atr_multiplier: 2
  },
  medium: {
    min_confluence_score: 3,
    risk_per_trade_pct: 2,
    sl_atr_multiplier: 2,
    tp_atr_multiplier: 3
  },
  high: {
    min_confluence_score: 2,
    risk_per_trade_pct: 4,
    sl_atr_multiplier: 3,
    tp_atr_multiplier: 4
  }
};
