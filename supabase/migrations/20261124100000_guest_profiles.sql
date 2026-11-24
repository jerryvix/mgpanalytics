-- Guest sign-in fix (Nov 24): anonymous sign-ins failed with "Database error creating
-- anonymous user" because handle_new_user copies auth.users.email into profiles.email,
-- which was NOT NULL, and a guest has no email. A guest's profile now has a null email
-- (daily-digest already skips null emails; the website never has guests), and the email
-- is copied over when a guest adds one (converts to an account) or anyone changes it.

alter table public.profiles alter column email drop not null;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email, updated_at = now()
  where id = new.id and email is distinct from new.email;
  return new;
end;
$$;

revoke all on function public.sync_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();
