alter table trades
  drop constraint if exists trades_exit_reason_check;

alter table trades
  add constraint trades_exit_reason_check
  check (exit_reason in ('stop_loss', 'take_profit', 'reverse_signal', 'manual_market_close'));