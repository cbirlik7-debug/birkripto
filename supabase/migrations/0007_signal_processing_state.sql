-- Keep signal recording idempotent while allowing failed paper processing to retry.
alter table signals add column if not exists processed_at timestamptz;
