-- Takes (DECISIONS D-060, D-065, D-074): picks from outside betting shows, transcribed
-- free on GitHub Actions and extracted by Claude Haiku 5.5 in the ingest-takes edge
-- function. Forward-looking only: a take is shown until its game starts, and no
-- records are kept for display.

create table if not exists public.takes (
  id uuid primary key default gen_random_uuid(),
  show text not null,                    -- feed key: early-edge, bear-bets, hold-the-phone
  show_name text not null,               -- display credit: SportsLine, Bear Bets, Hold The Phone
  person text,                           -- named host when the show says who made the pick
  sport text not null,                   -- NFL, NBA, NCAAF, NCAAB
  espn_event_id text not null,
  matchup text not null,                 -- "Cavaliers at Bulls"
  starts_at timestamptz not null,        -- hidden from kickoff on
  market text not null check (market in ('spread', 'total', 'moneyline', 'prop', 'parlay', 'other')),
  pick text not null,                    -- sportsbook notation with a plain hyphen: "Bengals -6"
  price text,                            -- as quoted on the show: "-110", "+400"
  legs text[] not null default '{}',     -- parlay legs, one per entry
  why text,                              -- one or two sentences, their reasons
  risks text,                            -- the risks they named
  said_at_seconds integer,
  episode_guid text not null,
  episode_title text,
  episode_published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (episode_guid, espn_event_id, pick)
);

create index if not exists takes_starts_at_idx on public.takes (starts_at);

alter table public.takes enable row level security;

drop policy if exists "Takes are public" on public.takes;
create policy "Takes are public" on public.takes for select using (true);

-- Which episodes have been processed, so the daily job transcribes only new ones.
create table if not exists public.takes_episodes (
  guid text primary key,
  show text not null,
  title text,
  published_at timestamptz,
  audio_seconds integer,
  picks_found integer not null default 0,
  model text,
  processed_at timestamptz not null default now()
);

alter table public.takes_episodes enable row level security;
-- No policies: only the service role (the ingest function) reads or writes episodes.
