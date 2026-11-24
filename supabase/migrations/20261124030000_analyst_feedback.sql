-- The Analyst's feedback loop (DECISIONS D-082): a thumbs up or down on each answer,
-- with an optional reason and note, saved with the question and answer so weak answers
-- can be reviewed, fixed and re-tested.
create table if not exists public.analyst_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source text not null check (source in ('app', 'web')),
  rating text not null check (rating in ('up', 'down')),
  reason text check (reason in ('wrong', 'outdated', 'missed', 'too_long', 'other')),
  note text check (char_length(note) <= 1000),
  question text not null check (char_length(question) <= 4000),
  answer text not null check (char_length(answer) <= 20000),
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analyst_feedback_created_idx on public.analyst_feedback (created_at desc);

alter table public.analyst_feedback enable row level security;

-- People can add and change their own ratings; nobody reads others'. Review happens with the
-- service role (weekly summary) and in the web-only admin panel.
drop policy if exists "Users add their own feedback" on public.analyst_feedback;
create policy "Users add their own feedback" on public.analyst_feedback for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users update their own feedback" on public.analyst_feedback;
create policy "Users update their own feedback" on public.analyst_feedback for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users read their own feedback" on public.analyst_feedback;
create policy "Users read their own feedback" on public.analyst_feedback for select to authenticated using (user_id = auth.uid());
