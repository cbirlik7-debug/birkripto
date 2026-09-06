-- Kaldıraç sütunu ekleme (bot_config, positions, trades)
alter table bot_config add column if not exists leverage int not null default 5;
alter table positions add column if not exists leverage int not null default 5;
alter table trades add column if not exists leverage int not null default 5;
