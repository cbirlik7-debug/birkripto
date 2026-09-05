import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env değişkenleri eksik. .env dosyanızı kontrol edin.')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

// Tipler
export interface BotConfig {
  id: string
  symbol: string
  timeframe: string
  is_active: boolean
  risk_level: 'low' | 'medium' | 'high'
  enabled_indicators: string[]
  indicator_params: Record<string, number>
  min_confluence_score: number
  sl_atr_multiplier: number
  tp_atr_multiplier: number
  risk_per_trade_pct: number
  commission_pct: number
  created_at: string
}

export interface StrategyAccount {
  id: string
  config_id: string
  balance: number
  starting_balance: number
  updated_at: string
}

export interface Position {
  id: string
  config_id: string
  symbol: string
  direction: 'long' | 'short'
  entry_price: number
  size: number
  stop_loss: number
  take_profit: number
  status: 'open' | 'closed'
  opened_at: string
}

export interface Trade {
  id: string
  position_id: string
  config_id: string
  symbol: string
  direction: 'long' | 'short'
  entry_price: number
  exit_price: number
  size: number
  pnl: number
  pnl_pct: number
  commission: number
  exit_reason: 'stop_loss' | 'take_profit' | 'reverse_signal'
  opened_at: string
  closed_at: string
}

export interface Signal {
  id: string
  config_id: string
  symbol: string
  direction: 'long' | 'short' | 'neutral'
  score: number
  price: number
  reasons: string[]
  created_at: string
}

export interface EquitySnapshot {
  id: string
  config_id: string
  balance: number
  created_at: string
}
