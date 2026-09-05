-- =============================================
-- Kripto Paper Trading Bot - Veritabanı Şeması
-- =============================================

-- Asset bazlı bot konfigürasyonu
create table if not exists bot_config (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  timeframe text not null default '15m',
  is_active boolean default true,
  risk_level text not null default 'medium',
  enabled_indicators jsonb not null default '["ema","rsi","atr","volume_profile"]',
  indicator_params jsonb not null default '{"ema_fast":12,"ema_slow":26,"rsi_period":14,"atr_period":14,"volume_profile_bins":24}',
  min_confluence_score int not null default 3,
  sl_atr_multiplier numeric not null default 2,
  tp_atr_multiplier numeric not null default 3,
  risk_per_trade_pct numeric not null default 2,
  commission_pct numeric not null default 0.04,
  created_at timestamptz default now()
);

-- Her config'in kendi sanal bakiyesi
create table if not exists strategy_accounts (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id) on delete cascade,
  balance numeric not null default 10000,
  starting_balance numeric not null default 10000,
  updated_at timestamptz default now()
);

-- Açık/kapalı pozisyonlar
create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id) on delete cascade,
  symbol text not null,
  direction text not null check (direction in ('long','short')),
  entry_price numeric not null,
  size numeric not null,
  stop_loss numeric not null,
  take_profit numeric not null,
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz default now()
);

-- Kapanmış trade'ler
create table if not exists trades (
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
  exit_reason text not null check (exit_reason in ('stop_loss','take_profit','reverse_signal')),
  opened_at timestamptz not null,
  closed_at timestamptz default now()
);

-- Üretilen sinyaller
create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id),
  symbol text not null,
  direction text not null check (direction in ('long','short','neutral')),
  score int not null,
  price numeric not null,
  reasons jsonb not null default '[]',
  created_at timestamptz default now()
);

-- Equity snapshots (bakiye geçmişi)
create table if not exists equity_snapshots (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id),
  balance numeric not null,
  created_at timestamptz default now()
);

-- =============================================
-- Row Level Security (RLS)
-- =============================================
alter table bot_config enable row level security;
alter table strategy_accounts enable row level security;
alter table positions enable row level security;
alter table trades enable row level security;
alter table signals enable row level security;
alter table equity_snapshots enable row level security;

-- anon rolüne sadece SELECT izni
create policy "anon_select_bot_config" on bot_config for select to anon using (true);
create policy "anon_select_strategy_accounts" on strategy_accounts for select to anon using (true);
create policy "anon_select_positions" on positions for select to anon using (true);
create policy "anon_select_trades" on trades for select to anon using (true);
create policy "anon_select_signals" on signals for select to anon using (true);
create policy "anon_select_equity_snapshots" on equity_snapshots for select to anon using (true);

-- =============================================
-- Auto-create strategy_accounts on new config
-- =============================================
create or replace function create_strategy_account()
returns trigger as $$
begin
  insert into strategy_accounts (config_id) values (NEW.id);
  return NEW;
end;
$$ language plpgsql security definer;

create trigger after_bot_config_insert
  after insert on bot_config
  for each row execute function create_strategy_account();
