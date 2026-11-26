-- D-127: each team's record this season against the spread and on the total, written by the daily
-- game-lines job (scripts/angles/team_records.py through ingest-game-lines) and read by the Analyst,
-- so its records come from MGP's own games and closing lines. One row per team, replaced each run.
create table if not exists public.team_records (
  sport text not null check (sport in ('NFL', 'NCAAF', 'NBA', 'NCAAB')),
  team text not null,
  season integer not null,
  team_name text not null,
  through date not null,
  record jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (sport, team)
);

alter table public.team_records enable row level security;

-- Signed-in people read them through the Analyst (it queries with the person's own session); only
-- the service role writes.
drop policy if exists "team records are readable when signed in" on public.team_records;
create policy "team records are readable when signed in" on public.team_records
  for select to authenticated using (true);

grant select on public.team_records to authenticated;
