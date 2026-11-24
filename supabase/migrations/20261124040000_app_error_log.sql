-- D-090: the iPhone app logs a failed Analyst call (status, time, a short reason) so it can be
-- looked into without a screenshot. People can add only their own rows, tagged as the app's;
-- reading stays limited to their own rows (existing policy).
create policy "App logs its own failed calls"
  on public.api_request_log
  for insert
  to authenticated
  with check (auth.uid() = user_id and provider = 'mgp-app');
