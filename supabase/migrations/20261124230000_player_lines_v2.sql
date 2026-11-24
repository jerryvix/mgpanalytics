-- Player lines v2 (DECISIONS D-106): the judge picks the line a game shows; each row keeps the
-- ticker shown under it (tonight's opponent's rank, "CHI DEF 7th in Rush YPG Allowed"), its
-- family and angle type (for variety across the slate) and whether the judge's wording or the
-- engine's draft was stored.
alter table public.player_lines
  add column if not exists ticker text,
  add column if not exists family text,
  add column if not exists angle_type text,
  add column if not exists chosen_by text check (chosen_by in ('judge', 'engine'));

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
                                   market_short, line, side, price, text, hits, games, record, tier, rank,
                                   ticker, family, angle_type, chosen_by)
  select p_event, r->>'sport', (r->>'starts_at')::timestamptz, r->>'player_name', r->>'short_name', r->>'espn_athlete_id',
         r->>'team', r->>'market', r->>'market_short', (r->>'line')::numeric, r->>'side', nullif(r->>'price', ''), r->>'text',
         (r->>'hits')::integer, (r->>'games')::integer, r->>'record', r->>'tier', (r->>'rank')::smallint,
         nullif(r->>'ticker', ''), r->>'family', r->>'angle_type', coalesce(r->>'chosen_by', 'engine')
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.replace_player_lines(text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_player_lines(text, jsonb) to service_role;
