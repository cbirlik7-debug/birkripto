import { createClient, SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_URL = 'https://rromrgcpklrkxkourmie.supabase.co'
const DUMMY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'

function getInitialUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('birkripto_supabase_url')
    if (saved && saved.trim()) return saved.trim()
  }
  return (import.meta.env.VITE_SUPABASE_URL as string) || DEFAULT_URL
}

function getInitialKey(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('birkripto_supabase_anon_key')
    if (saved && saved.trim()) return saved.trim()
  }
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || DUMMY_KEY
}

export const supabaseUrl = getInitialUrl()
export const supabaseAnonKey = getInitialKey()

export function isConfigured(): boolean {
  return Boolean(
    supabaseAnonKey &&
    supabaseAnonKey !== DUMMY_KEY &&
    !supabaseAnonKey.includes('dummy')
  )
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)

export function updateSupabaseCredentials(url: string, key: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('birkripto_supabase_url', url.trim())
    localStorage.setItem('birkripto_supabase_anon_key', key.trim())
    window.location.reload()
  }
}

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
  leverage?: number
  max_daily_loss_pct?: number
  max_consecutive_losses?: number
  max_open_positions?: number
  cooldown_minutes?: number
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
  leverage?: number
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
  entry_reason?: string
  duration_seconds?: number
  roe_pct?: number
  leverage?: number
  exit_reason: 'stop_loss' | 'take_profit' | 'reverse_signal' | 'manual_market_close' | string
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
