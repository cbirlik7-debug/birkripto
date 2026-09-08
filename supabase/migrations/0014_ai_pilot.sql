-- Migration 0014: AI Pilot tables and RPC functions for Local LLM Trading

create table if not exists ai_pilot_logs (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references bot_config(id) on delete set null,
  symbol text not null,
  action text not null check (action in ('ANALYSIS', 'SIGNAL_GENERATED', 'ORDER_OPENED', 'ORDER_CLOSED', 'SKIP', 'ERROR')),
  model_used text not null default 'local-llm',
  prompt_summary text,
  decision jsonb not null default '{}'::jsonb,
  status text not null default 'INFO' check (status in ('INFO', 'EXECUTED', 'SKIPPED', 'FAILED', 'REJECTED')),
  position_id uuid references positions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table ai_pilot_logs enable row level security;

drop policy if exists "anon_select_ai_pilot_logs" on ai_pilot_logs;
create policy "anon_select_ai_pilot_logs"
  on ai_pilot_logs for select to anon, authenticated
  using (true);

create or replace function log_ai_pilot_action(
  p_config_id uuid,
  p_symbol text,
  p_action text,
  p_model_used text,
  p_prompt_summary text,
  p_decision jsonb,
  p_status text,
  p_position_id uuid default null
)
returns ai_pilot_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  log_row ai_pilot_logs;
begin
  insert into ai_pilot_logs (
    config_id, symbol, action, model_used, prompt_summary, decision, status, position_id
  ) values (
    p_config_id, p_symbol, p_action, coalesce(p_model_used, 'local-llm'), p_prompt_summary, coalesce(p_decision, '{}'::jsonb), coalesce(p_status, 'INFO'), p_position_id
  )
  returning * into log_row;
  return log_row;
end;
$$;

create or replace function execute_ai_pilot_order(
  p_config_id uuid,
  p_symbol text,
  p_direction text,
  p_entry_price numeric,
  p_size numeric,
  p_stop_loss numeric,
  p_take_profit numeric,
  p_leverage int,
  p_model_used text,
  p_decision jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  opened_pos positions;
  log_row ai_pilot_logs;
begin
  -- Open the position using open_manual_position logic
  opened_pos := open_manual_position(
    p_config_id, p_symbol, p_direction, p_entry_price, p_size, p_stop_loss, p_take_profit, p_leverage
  );

  -- Log the execution
  insert into ai_pilot_logs (
    config_id, symbol, action, model_used, prompt_summary, decision, status, position_id
  ) values (
    p_config_id, p_symbol, 'ORDER_OPENED', coalesce(p_model_used, 'local-llm'),
    format('AI Pilot %s pozisyonu açtı @ %s (Kaldıraç: %sx)', upper(p_direction), p_entry_price, p_leverage),
    coalesce(p_decision, '{}'::jsonb), 'EXECUTED', opened_pos.id
  )
  returning * into log_row;

  return jsonb_build_object(
    'success', true,
    'position', row_to_json(opened_pos),
    'log_id', log_row.id
  );
end;
$$;

revoke all on function log_ai_pilot_action from public;
revoke all on function execute_ai_pilot_order from public;
grant execute on function log_ai_pilot_action to anon, authenticated;
grant execute on function execute_ai_pilot_order to anon, authenticated;
