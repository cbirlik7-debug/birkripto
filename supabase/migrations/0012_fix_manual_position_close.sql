-- Repair accounts that may be missing for configs created before the account trigger.
insert into strategy_accounts (config_id, balance, starting_balance)
select config.id, 10000.00, 10000.00
from bot_config as config
where not exists (
  select 1
  from strategy_accounts as account
  where account.config_id = config.id
);

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

  select * into position_row
  from positions
  where id = p_position_id and status = 'open'
  for update;
  if position_row.id is null then
    raise exception 'Açık pozisyon bulunamadı';
  end if;

  select * into config_row from bot_config where id = position_row.config_id;
  if config_row.id is null then
    raise exception 'Pozisyon konfigürasyonu bulunamadı';
  end if;

  select * into account_row
  from strategy_accounts
  where config_id = position_row.config_id
  for update;

  -- Keep manual close usable for configs created before the account trigger.
  if account_row.id is null then
    insert into strategy_accounts (config_id, balance, starting_balance)
    values (position_row.config_id, 10000.00, 10000.00)
    returning * into account_row;
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

revoke all on function close_manual_position(uuid, numeric) from public;
grant execute on function close_manual_position(uuid, numeric) to anon, authenticated;