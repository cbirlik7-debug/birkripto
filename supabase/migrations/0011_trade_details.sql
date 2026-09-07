alter table positions add column if not exists entry_reason text not null default 'manual_entry';
alter table trades add column if not exists entry_reason text;
alter table trades add column if not exists duration_seconds int;
alter table trades add column if not exists roe_pct numeric;

create or replace function enrich_trade_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  position_reason text;
  position_leverage numeric;
  initial_margin numeric;
begin
  select entry_reason, leverage
  into position_reason, position_leverage
  from positions
  where id = new.position_id;

  new.entry_reason := coalesce(new.entry_reason, position_reason, 'manual_entry');
  new.duration_seconds := greatest(
    0,
    extract(epoch from (coalesce(new.closed_at, now()) - new.opened_at))
  )::int;
  initial_margin := (new.entry_price * new.size) / greatest(coalesce(new.leverage, position_leverage, 1), 1);
  new.roe_pct := case
    when initial_margin > 0 then (new.pnl / initial_margin) * 100
    else null
  end;

  return new;
end;
$$;

drop trigger if exists enrich_trade_details_before_insert on trades;
create trigger enrich_trade_details_before_insert
  before insert on trades
  for each row execute function enrich_trade_details();

update trades as trade
set
  entry_reason = coalesce(trade.entry_reason, position.entry_reason, 'manual_entry'),
  duration_seconds = greatest(0, extract(epoch from (trade.closed_at - trade.opened_at)))::int,
  roe_pct = case
    when (trade.entry_price * trade.size) / greatest(coalesce(trade.leverage, 1), 1) > 0
      then trade.pnl / ((trade.entry_price * trade.size) / greatest(coalesce(trade.leverage, 1), 1)) * 100
    else null
  end
from positions as position
where position.id = trade.position_id;
