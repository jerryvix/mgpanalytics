-- Player lines (DECISIONS D-105): the strongest computed, fact-checked facts about a game's
-- players measured against that game's DraftKings prop number. The top 3 per game are kept
-- (rank 1 is the one the app shows); the daily game-lines workflow replaces a game's rows on
-- every run through ingest-player-lines (GitHub OIDC, main only).
create table if not exists public.player_lines (
  id bigint generated always as identity primary key,
  espn_event_id text not null,
  sport text not null check (sport in ('NFL', 'NBA')),
  starts_at timestamptz not null,
  player_name text not null,           -- "Travis Kelce"
  short_name text not null,            -- "T. Kelce"
  espn_athlete_id text not null,
  team text not null,                  -- ESPN abbreviation: "KC"
  market text not null,                -- engine key: "rec_yds"
  market_short text not null,          -- "Rec Yds"
  line numeric not null,               -- 43.5
  side text not null check (side in ('over', 'under')),
  price text,                          -- that side's DraftKings price, "-110"; null when the feed has none
  text text not null,                  -- "Travis Kelce has topped 43.5 receiving yards in 40 of his last 48 prime-time games"
  hits integer not null check (hits >= 0),
  games integer not null check (games > 0 and hits <= games),
  record text not null,                -- the run of the text the app bolds: "40 of his last 48"
  tier text not null check (tier in ('strong', 'fallback')),
  rank smallint not null check (rank between 1 and 3),
  created_at timestamptz not null default now(),
  unique (espn_event_id, rank)
);

create index if not exists player_lines_starts_at_idx on public.player_lines (starts_at);

alter table public.player_lines enable row level security;
drop policy if exists "Player lines are public" on public.player_lines;
create policy "Player lines are public" on public.player_lines for select using (true);
-- No insert, update or delete policy: only the service role (ingest-player-lines) writes.

-- Replace one game's rows in a single transaction, so a reader never sees a game half written.
create or replace function public.replace_player_lines(p_event text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.player_lines where espn_event_id = p_event;
  insert into public.player_lines (espn_event_id, sport, starts_at, player_name, short_name, espn_athlete_id, team, market,
                                   market_short, line, side, price, text, hits, games, record, tier, rank)
  select p_event, r->>'sport', (r->>'starts_at')::timestamptz, r->>'player_name', r->>'short_name', r->>'espn_athlete_id',
         r->>'team', r->>'market', r->>'market_short', (r->>'line')::numeric, r->>'side', nullif(r->>'price', ''), r->>'text',
         (r->>'hits')::integer, (r->>'games')::integer, r->>'record', r->>'tier', (r->>'rank')::smallint
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.replace_player_lines(text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_player_lines(text, jsonb) to service_role;
