-- X takes (DECISIONS D-102): public posts as a free Takes source. No paid X API.
-- Picks land in `takes` next to podcast and YouTube picks. Public betting notes
-- (ticket and handle share, line moves described by someone else) land in
-- `market_notes` and are shown beside betting splits, never as a bet.
--
-- `takes` gains where the row came from, the outside id, a link, stake size and
-- how sure the game match was. Existing rows are podcasts, except Daft Previews
-- (YouTube). Their external id is the episode guid they already had.

alter table public.takes
  add column if not exists source text not null default 'podcast',
  add column if not exists external_id text,
  add column if not exists url text,
  add column if not exists units numeric,
  add column if not exists match_confidence numeric;

update public.takes set source = 'youtube' where show = 'daft-previews';
update public.takes set external_id = episode_guid where external_id is null;

alter table public.takes drop constraint if exists takes_source_check;
alter table public.takes
  add constraint takes_source_check check (source in ('podcast', 'youtube', 'x'));

alter table public.takes drop constraint if exists takes_units_check;
alter table public.takes
  add constraint takes_units_check check (units is null or (units > 0 and units <= 100));

alter table public.takes drop constraint if exists takes_confidence_check;
alter table public.takes
  add constraint takes_confidence_check
  check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1));

alter table public.takes drop constraint if exists takes_url_check;
alter table public.takes
  add constraint takes_url_check check (url is null or left(url, 8) = 'https://');

-- A podcast ingest that has not been redeployed yet still inserts without
-- external_id. Fill it from the episode guid so the column can be required.
create or replace function public.takes_fill_external_id()
returns trigger
language plpgsql
as $$
begin
  if new.external_id is null or btrim(new.external_id) = '' then
    new.external_id := new.episode_guid;
  end if;
  return new;
end;
$$;

drop trigger if exists takes_fill_external_id on public.takes;
create trigger takes_fill_external_id
  before insert or update on public.takes
  for each row execute function public.takes_fill_external_id();

alter table public.takes alter column external_id set not null;

create index if not exists takes_external_id_idx on public.takes (external_id);

-- Credited market notes. One row per post plus the note text, so posting the
-- same item again updates the match instead of adding a second note.
create table if not exists public.market_notes (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'x' check (source in ('x')),
  handle text not null,
  author_name text not null,
  credit text not null,
  sport text not null,
  espn_event_id text not null,
  matchup text not null,
  starts_at timestamptz not null,
  away_name text not null,
  home_name text not null,
  market text check (market is null or market in ('spread', 'total', 'moneyline', 'prop', 'parlay', 'other')),
  body text not null check (char_length(body) between 1 and 500),
  post_id text not null check (post_id ~ '^[A-Za-z0-9_]{2,40}$'),
  url text not null check (left(url, 8) = 'https://'),
  posted_at timestamptz,
  match_confidence numeric not null check (match_confidence >= 0 and match_confidence <= 1),
  created_at timestamptz not null default now(),
  unique (post_id, body)
);

create index if not exists market_notes_event_idx on public.market_notes (espn_event_id);
create index if not exists market_notes_sport_starts_idx on public.market_notes (sport, starts_at);

alter table public.market_notes enable row level security;

drop policy if exists "Market notes are public" on public.market_notes;
create policy "Market notes are public" on public.market_notes for select using (true);
