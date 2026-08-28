-- Asset bazlı bot konfigürasyonu (her coin için ayrı satır)
create table bot_config (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,                    -- 'BTCUSDT'
  timeframe text not null default '15m',
  is_active boolean default true,
  risk_level text not null default 'medium', -- 'low' | 'medium' | 'high'
  enabled_indicators jsonb not null,       -- ["ema","rsi","atr","volume_profile"]
  indicator_params jsonb not null,         -- {ema_fast:12, ema_slow:26, rsi_period:14, ...}
  min_confluence_score int not null default 3,
  sl_atr_multiplier numeric not null default 2,
  tp_atr_multiplier numeric not null default 3,
  risk_per_trade_pct numeric not null default 2,
  commission_pct numeric not null default 0.04,
  created_at timestamptz default now()
);

-- Her config'in kendi sanal bakiyesi (config bazlı performans karşılaştırması için)
create table strategy_accounts (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id),
  balance numeric not null default 10000,
  starting_balance numeric not null default 10000,
  updated_at timestamptz default now()
);

create table positions (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id),
  symbol text not null,
  direction text not null,                 -- 'long' | 'short'
  entry_price numeric not null,
  size numeric not null,
  stop_loss numeric not null,
  take_profit numeric not null,
  status text not null default 'open',     -- 'open' | 'closed'
  opened_at timestamptz default now()
);

create table trades (
  id uuid primary key default gen_random_uuid(),
  position_id uuid references positions(id),
  config_id uuid references bot_config(id),
  symbol text not null,
  direction text not null,
  entry_price numeric not null,
  exit_price numeric not null,
  size numeric not null,
  pnl numeric not null,
  pnl_pct numeric not null,
  commission numeric not null,
  exit_reason text not null,               -- 'stop_loss' | 'take_profit' | 'reverse_signal'
  opened_at timestamptz not null,
  closed_at timestamptz default now()
);

create table signals (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id),
  symbol text not null,
  direction text not null,                 -- 'long' | 'short' | 'neutral'
  score int not null,
  price numeric not null,
  reasons jsonb not null,                  -- ["EMA trend up", "RSI 55 rising", ...]
  created_at timestamptz default now()
);

create table equity_snapshots (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id),
  balance numeric not null,
  created_at timestamptz default now()
);

-- LLM modülünün önerdiği yeni strateji konfigürasyonları (henüz canlıya alınmamış)
create table strategy_suggestions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  suggested_config jsonb not null,         -- bot_config ile aynı şekilde
  based_on_analysis text not null,         -- LLM'in gerekçesi
  status text not null default 'pending',  -- 'pending' | 'accepted' | 'rejected'
  created_at timestamptz default now()
);

-- Row Level Security (RLS)
alter table bot_config enable row level security;
alter table strategy_accounts enable row level security;
alter table positions enable row level security;
alter table trades enable row level security;
alter table signals enable row level security;
alter table equity_snapshots enable row level security;
alter table strategy_suggestions enable row level security;

-- Policies for 'anon' role (read only)
create policy "Allow anon to select bot_config" on bot_config for select to anon using (true);
create policy "Allow anon to select strategy_accounts" on strategy_accounts for select to anon using (true);
create policy "Allow anon to select positions" on positions for select to anon using (true);
create policy "Allow anon to select trades" on trades for select to anon using (true);
create policy "Allow anon to select signals" on signals for select to anon using (true);
create policy "Allow anon to select equity_snapshots" on equity_snapshots for select to anon using (true);
create policy "Allow anon to select strategy_suggestions" on strategy_suggestions for select to anon using (true);
