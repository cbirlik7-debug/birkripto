create or replace function close_monitored_position(
  p_position_id uuid,
  p_exit_price numeric,
  p_exit_reason text
)
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
  if p_exit_price <= 0 or p_exit_reason not in ('stop_loss', 'take_profit') then
    raise exception 'Geçersiz monitor kapanış parametreleri';
  end if;

  select * into position_row
  from positions
  where id = p_position_id and status = 'open'
  for update;

  if position_row.id is null then
    raise exception 'Açık pozisyon bulunamadı';
  end if;

  select * into config_row from bot_config where id = position_row.config_id;
  select * into account_row
  from strategy_accounts
  where config_id = position_row.config_id
  for update;

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
    position_row.leverage, p_exit_reason, position_row.opened_at
  ) returning id into trade_id;

  update positions set status = 'closed' where id = position_row.id;
  update strategy_accounts set balance = new_balance, updated_at = now() where id = account_row.id;
  insert into equity_snapshots (config_id, balance) values (position_row.config_id, new_balance);

  return jsonb_build_object(
    'trade_id', trade_id,
    'net_pnl', net_pnl,
    'commission', total_commission,
    'balance', new_balance,
    'exit_reason', p_exit_reason
  );
end;
$$;

revoke all on function close_monitored_position(uuid, numeric, text) from public;
grant execute on function close_monitored_position(uuid, numeric, text) to service_role;
