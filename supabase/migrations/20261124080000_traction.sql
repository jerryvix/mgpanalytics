-- Traction (owner decision, Nov 24): who signs up, who comes back, and how much they use
-- the Analyst, read on the website's admin panel.
--
-- app_activity: one row per person, per US Eastern day, per surface ('app' or 'web'),
-- written by the signed-in app or website (guests included: anonymous users are
-- `authenticated`). Clients upsert with ON CONFLICT DO NOTHING (supabase-js
-- `ignoreDuplicates: true`), so no update policy is needed. People add and read only
-- their own rows; the insert also has to be for about today (Eastern date, give or take a
-- day for clocks and time zones). Rows go with the account (ON DELETE CASCADE), so
-- delete-account needs no change.
--
-- admin_traction(days): the admin panel's numbers, admins only (has_role).

create table if not exists public.app_activity (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  source text not null check (source in ('app', 'web')),
  first_seen timestamptz not null default now(),
  primary key (user_id, day, source)
);

create index if not exists app_activity_day_idx on public.app_activity (day);

alter table public.app_activity enable row level security;
revoke all on table public.app_activity from anon;

drop policy if exists "Users add their own activity" on public.app_activity;
create policy "Users add their own activity" on public.app_activity
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and day between (now() at time zone 'America/New_York')::date - 1
                and (now() at time zone 'America/New_York')::date + 1
  );

drop policy if exists "Users read their own activity" on public.app_activity;
create policy "Users read their own activity" on public.app_activity
  for select to authenticated
  using (user_id = auth.uid());

-- Days are US Eastern. A sign-up's source is raw_user_meta_data.signup_source ('app');
-- anything else, or missing, counts as 'web'. A guest who later adds an email or Google
-- keeps the same id: they show as converted when the account's first real identity
-- came more than a minute after the user row, and their sign-up day is that identity's.
create or replace function public.admin_traction(days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := least(greatest(coalesce(days, 30), 1), 366);
  v_today date := (now() at time zone 'America/New_York')::date;
  v_start date := v_today - (least(greatest(coalesce(days, 30), 1), 366) - 1);
  v_result jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with people as (
    select
      u.id,
      u.email,
      u.is_anonymous,
      u.created_at,
      case when u.raw_user_meta_data->>'signup_source' = 'app' then 'app' else 'web' end as signup_source,
      (select min(i.created_at) from auth.identities i
        where i.user_id = u.id and i.provider <> 'anonymous') as first_identity_at
    from auth.users u
    where u.deleted_at is null
  ),
  accounts as (
    select
      p.*,
      coalesce(p.first_identity_at > p.created_at + interval '1 minute', false) as was_guest,
      case when p.first_identity_at > p.created_at + interval '1 minute'
        then p.first_identity_at else p.created_at end as signed_up_at
    from people p
    where not p.is_anonymous
  ),
  series as (
    select d::date as day from generate_series(v_start, v_today, interval '1 day') d
  ),
  signups as (
    select (a.signed_up_at at time zone 'America/New_York')::date as day,
      count(*) filter (where a.signup_source = 'app') as app,
      count(*) filter (where a.signup_source = 'web') as web
    from accounts a group by 1
  ),
  -- Everyone who started as a guest (still a guest, or converted), by the day they started
  new_guests as (
    select (p.created_at at time zone 'America/New_York')::date as day, count(*) as guests
    from people p
    where p.is_anonymous or exists (select 1 from accounts a where a.id = p.id and a.was_guest)
    group by 1
  ),
  active as (
    select aa.day,
      count(distinct aa.user_id) filter (where aa.source = 'app') as app,
      count(distinct aa.user_id) filter (where aa.source = 'web') as web,
      count(distinct aa.user_id) as total
    from public.app_activity aa
    where aa.day between v_start and v_today
    group by aa.day
  ),
  questions as (
    select au.day, sum(au.count) as questions
    from public.analyst_usage au
    where au.day between v_start and v_today
    group by au.day
  )
  select jsonb_build_object(
    'generated_at', now(),
    'today', v_today,
    'days', v_days,
    'accounts', (select count(*) from accounts),
    'guests', (select count(*) from people where is_anonymous),
    'converted_guests', (select count(*) from accounts where was_guest),
    'active', jsonb_build_object(
      'today', (select count(distinct user_id) from public.app_activity where day = v_today),
      'last_7', (select count(distinct user_id) from public.app_activity where day between v_today - 6 and v_today),
      'last_30', (select count(distinct user_id) from public.app_activity where day between v_today - 29 and v_today)
    ),
    'questions_today', coalesce((select sum(count) from public.analyst_usage where day = v_today), 0),
    'feedback', jsonb_build_object(
      'up', (select count(*) from public.analyst_feedback where rating = 'up'),
      'down', (select count(*) from public.analyst_feedback where rating = 'down'),
      'up_7d', (select count(*) from public.analyst_feedback
        where rating = 'up' and (created_at at time zone 'America/New_York')::date >= v_today - 6),
      'down_7d', (select count(*) from public.analyst_feedback
        where rating = 'down' and (created_at at time zone 'America/New_York')::date >= v_today - 6)
    ),
    'chats', jsonb_build_object(
      'total', (select count(*) from public.conversations),
      'in_window', (select count(*) from public.conversations
        where (created_at at time zone 'America/New_York')::date >= v_start)
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', s.day,
        'signups_app', coalesce(su.app, 0),
        'signups_web', coalesce(su.web, 0),
        'new_guests', coalesce(g.guests, 0),
        'active_app', coalesce(ac.app, 0),
        'active_web', coalesce(ac.web, 0),
        'active_total', coalesce(ac.total, 0),
        'questions', coalesce(q.questions, 0)
      ) order by s.day), '[]'::jsonb)
      from series s
      left join signups su on su.day = s.day
      left join new_guests g on g.day = s.day
      left join active ac on ac.day = s.day
      left join questions q on q.day = s.day
    ),
    'newest_accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'email', n.email,
        'created_at', n.signed_up_at,
        'signup_source', n.signup_source,
        'was_guest', n.was_guest
      ) order by n.signed_up_at desc), '[]'::jsonb)
      from (select * from accounts order by signed_up_at desc limit 20) n
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_traction(integer) from public, anon, service_role;
grant execute on function public.admin_traction(integer) to authenticated;
