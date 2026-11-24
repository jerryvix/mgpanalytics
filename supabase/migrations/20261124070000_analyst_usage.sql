-- Audit S2: a per-person daily cap on Analyst questions (gemini-chat). One row per person
-- per US Eastern day (America/New_York, so the count resets at midnight ET). gemini-chat
-- calls increment_analyst_usage with the service role after a request passes its input
-- checks and before any model call, and answers 429 past ANALYST_DAILY_LIMIT (default 50).
-- RLS is on with no policies and the table and function are granted to the service role
-- only, so people can't read, reset or bump anyone's count. Rows go with the account.

create table if not exists public.analyst_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.analyst_usage enable row level security;
revoke all on table public.analyst_usage from anon, authenticated;
grant all on table public.analyst_usage to service_role;

-- Adds one question for today (Eastern) and returns today's count, in one statement
create or replace function public.increment_analyst_usage(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.analyst_usage as u (user_id, day, count)
  values (p_user_id, (now() at time zone 'America/New_York')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count;
$$;

revoke all on function public.increment_analyst_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_analyst_usage(uuid) to service_role;
