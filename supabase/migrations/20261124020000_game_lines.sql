-- The one line per game (DECISIONS D-075, D-078): one computed, fact-checked angle per
-- upcoming game, written by the daily game-lines workflow through ingest-game-lines.
create table if not exists public.game_lines (
  espn_event_id text primary key,
  sport text not null,                 -- NFL, NCAAF, NBA
  matchup text not null,
  starts_at timestamptz not null,
  line_text text not null,             -- "Dak Prescott is 12-3 ATS against the Eagles in his career"
  supports text not null,              -- "DAL -8.5", "Under 43.5"
  market text not null check (market in ('spread', 'total')),
  record text not null,                -- "12-3"
  tier text not null check (tier in ('strong', 'fallback', 'season')),
  computed_at timestamptz not null default now()
);

create index if not exists game_lines_starts_at_idx on public.game_lines (starts_at);

alter table public.game_lines enable row level security;
drop policy if exists "Game lines are public" on public.game_lines;
create policy "Game lines are public" on public.game_lines for select using (true);
