create or replace function update_bot_config(p_config_id uuid, p_changes jsonb)
returns bot_config
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_config bot_config;
  requested_risk text := p_changes->>'risk_level';
  requested_indicators jsonb := p_changes->'enabled_indicators';
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Geçersiz ayar gövdesi';
  end if;

  if requested_risk is not null and requested_risk not in ('low', 'medium', 'high') then
    raise exception 'Geçersiz risk seviyesi';
  end if;

  if requested_indicators is not null and (
    jsonb_typeof(requested_indicators) <> 'array'
    or exists (
      select 1
      from jsonb_array_elements_text(requested_indicators) as indicator
      where indicator not in ('ema', 'rsi', 'atr', 'volume_profile')
    )
  ) then
    raise exception 'Geçersiz indikatör listesi';
  end if;

  update bot_config
  set
    risk_level = coalesce(p_changes->>'risk_level', risk_level),
    enabled_indicators = coalesce(requested_indicators, enabled_indicators),
    min_confluence_score = coalesce((p_changes->>'min_confluence_score')::int, min_confluence_score),
    sl_atr_multiplier = coalesce((p_changes->>'sl_atr_multiplier')::numeric, sl_atr_multiplier),
    tp_atr_multiplier = coalesce((p_changes->>'tp_atr_multiplier')::numeric, tp_atr_multiplier),
    risk_per_trade_pct = coalesce((p_changes->>'risk_per_trade_pct')::numeric, risk_per_trade_pct),
    commission_pct = coalesce((p_changes->>'commission_pct')::numeric, commission_pct),
    leverage = coalesce((p_changes->>'leverage')::int, leverage)
  where id = p_config_id
  returning * into updated_config;

  if updated_config.id is null then
    raise exception 'Bot konfigürasyonu bulunamadı';
  end if;

  if updated_config.min_confluence_score not between 1 and 4
    or updated_config.sl_atr_multiplier <= 0
    or updated_config.tp_atr_multiplier <= 0
    or updated_config.risk_per_trade_pct <= 0
    or updated_config.risk_per_trade_pct > 10
    or updated_config.commission_pct < 0
    or updated_config.commission_pct > 0.5
    or updated_config.leverage not between 1 and 20 then
    raise exception 'Bot ayarlarından biri geçersiz aralıkta';
  end if;

  return updated_config;
end;
$$;

revoke all on function update_bot_config(uuid, jsonb) from public;
grant execute on function update_bot_config(uuid, jsonb) to anon, authenticated;

drop policy if exists "anon_update_bot_config" on bot_config;