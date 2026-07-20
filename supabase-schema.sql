-- Supabase SQL Editor에 이 파일 내용을 그대로 붙여넣고 실행하세요.

create extension if not exists pgcrypto;

create table accounts (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  created_at  timestamptz default now()
);

create table characters (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references accounts(id) on delete cascade,
  nickname    text not null,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

create table raid_checks (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid references characters(id) on delete cascade,
  raid_key      text not null,
  difficulty    text not null,
  gate          int not null,
  week_key      text not null,
  checked_at    timestamptz default now(),
  unique (character_id, raid_key, difficulty, gate, week_key)
);

create table daily_checks (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid references characters(id) on delete cascade,
  content_key   text not null,
  day_key       text not null,
  checked_at    timestamptz default now(),
  unique (character_id, content_key, day_key)
);

create table custom_todos (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references accounts(id) on delete cascade,
  label         text not null,
  reset_type    text not null default 'weekly',
  period_key    text,
  checked       boolean default false,
  sort_order    int default 0,
  created_at    timestamptz default now()
);

create index idx_characters_account on characters(account_id);
create index idx_raid_checks_character on raid_checks(character_id, week_key);
create index idx_daily_checks_character on daily_checks(character_id, day_key);
create index idx_custom_todos_account on custom_todos(account_id);
