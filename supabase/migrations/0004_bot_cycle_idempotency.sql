-- A bot cycle can write at most one signal for a config and closed candle.
alter table signals add column if not exists candle_open_time bigint;

create unique index if not exists signals_config_candle_unique
  on signals (config_id, candle_open_time)
  where candle_open_time is not null;