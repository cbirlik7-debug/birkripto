-- anon rolüne tam paper trading izinleri
drop policy if exists "anon_all_strategy_accounts" on strategy_accounts;
create policy "anon_all_strategy_accounts" on strategy_accounts for all to anon using (true) with check (true);

drop policy if exists "anon_all_positions" on positions;
create policy "anon_all_positions" on positions for all to anon using (true) with check (true);

drop policy if exists "anon_all_trades" on trades;
create policy "anon_all_trades" on trades for all to anon using (true) with check (true);

drop policy if exists "anon_all_signals" on signals;
create policy "anon_all_signals" on signals for all to anon using (true) with check (true);

drop policy if exists "anon_all_equity_snapshots" on equity_snapshots;
create policy "anon_all_equity_snapshots" on equity_snapshots for all to anon using (true) with check (true);
