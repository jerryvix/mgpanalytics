-- Spend backstop (D-109): the total Analyst questions asked today (US Eastern day), across
-- everyone. gemini-chat reads it before counting a new question and pauses The Analyst for
-- the rest of the day past ANALYST_GLOBAL_DAILY_LIMIT (default 300), so many new accounts
-- can't run up the AI bill while email confirmation is off. Service role only, like
-- increment_analyst_usage.

create or replace function public.analyst_usage_total_today()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(count), 0)::integer
  from public.analyst_usage
  where day = (now() at time zone 'America/New_York')::date;
$$;

revoke all on function public.analyst_usage_total_today() from public, anon, authenticated;
grant execute on function public.analyst_usage_total_today() to service_role;
