create or replace function open_manual_position(
  p_config_id uuid,
  p_symbol text,
  p_direction text,
  p_entry_price numeric,
  p_size numeric,
  p_stop_loss numeric,
  p_take_profit numeric,
  p_leverage int
)
returns positions
language plpgsql
security definer
set search_path = public
as $$
declare
  opened_position positions;
begin
  if p_direction not in ('long', 'short')
    or p_entry_price <= 0
    or p_size <= 0
    or p_stop_loss <= 0
    or p_take_profit <= 0
    or p_leverage not between 1 and 20 then
    raise exception 'Geçersiz pozisyon parametreleri';
  end if;

  if not exists (select 1 from bot_config where id = p_config_id and symbol = p_symbol) then
    raise exception 'Bot konfigürasyonu bulunamadı';
  end if;

  if exists (select 1 from positions where config_id = p_config_id and status = 'open') then
    raise exception 'Bu stratejinin zaten açık pozisyonu var';
  end if;

  insert into positions (config_id, symbol, direction, entry_price, size, stop_loss, take_profit, leverage)
  values (p_config_id, p_symbol, p_direction, p_entry_price, p_size, p_stop_loss, p_take_profit, p_leverage)
  returning * into opened_position;

  return opened_position;
end;
$$;

create or replace function close_manual_position(p_position_id uuid, p_exit_price numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  position_row positions;
  config_row bot_config;
  account_row strategy_accounts;
  gross_pnl numeric;
  entry_commission numeric;
  exit_commission numeric;
  total_commission numeric;
  net_pnl numeric;
  new_balance numeric;
  trade_id uuid;
begin
  if p_exit_price <= 0 then
    raise exception 'Geçersiz çıkış fiyatı';
  end if;

  select * into position_row from positions where id = p_position_id and status = 'open' for update;
  if position_row.id is null then
    raise exception 'Açık pozisyon bulunamadı';
  end if;

  select * into config_row from bot_config where id = position_row.config_id;
  select * into account_row from strategy_accounts where config_id = position_row.config_id for update;
  if account_row.id is null then
    raise exception 'Strateji hesabı bulunamadı';
  end if;

  gross_pnl := case when position_row.direction = 'long'
    then (p_exit_price - position_row.entry_price) * position_row.size
    else (position_row.entry_price - p_exit_price) * position_row.size end;
  entry_commission := position_row.entry_price * position_row.size * (config_row.commission_pct / 100);
  exit_commission := p_exit_price * position_row.size * (config_row.commission_pct / 100);
  total_commission := entry_commission + exit_commission;
  net_pnl := gross_pnl - total_commission;
  new_balance := account_row.balance + net_pnl;

  insert into trades (
    position_id, config_id, symbol, direction, entry_price, exit_price, size,
    pnl, pnl_pct, commission, leverage, exit_reason, opened_at
  ) values (
    position_row.id, position_row.config_id, position_row.symbol, position_row.direction,
    position_row.entry_price, p_exit_price, position_row.size, net_pnl,
    (net_pnl / account_row.starting_balance) * 100, total_commission,
    position_row.leverage, 'manual_market_close', position_row.opened_at
  ) returning id into trade_id;

  update positions set status = 'closed' where id = position_row.id;
  update strategy_accounts set balance = new_balance, updated_at = now() where id = account_row.id;
  insert into equity_snapshots (config_id, balance) values (position_row.config_id, new_balance);

  return jsonb_build_object(
    'trade_id', trade_id,
    'net_pnl', net_pnl,
    'commission', total_commission,
    'balance', new_balance
  );
end;
$$;

revoke all on function open_manual_position(uuid, text, text, numeric, numeric, numeric, numeric, int) from public;
revoke all on function close_manual_position(uuid, numeric) from public;
grant execute on function open_manual_position(uuid, text, text, numeric, numeric, numeric, numeric, int) to anon, authenticated;
grant execute on function close_manual_position(uuid, numeric) to anon, authenticated;

drop policy if exists "anon_all_strategy_accounts" on strategy_accounts;
drop policy if exists "anon_all_positions" on positions;
drop policy if exists "anon_all_trades" on trades;
drop policy if exists "anon_all_equity_snapshots" on equity_snapshots;
drop policy if exists "anon_select_strategy_accounts" on strategy_accounts;
drop policy if exists "anon_select_positions" on positions;
drop policy if exists "anon_select_trades" on trades;
drop policy if exists "anon_select_equity_snapshots" on equity_snapshots;
create policy "anon_select_strategy_accounts" on strategy_accounts for select to anon using (true);
create policy "anon_select_positions" on positions for select to anon using (true);
create policy "anon_select_trades" on trades for select to anon using (true);
create policy "anon_select_equity_snapshots" on equity_snapshots for select to anon using (true);