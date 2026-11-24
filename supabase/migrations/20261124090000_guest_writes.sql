-- Guests (owner decision, Nov 24): the app signs every install in as an anonymous Supabase
-- user, so a guest holds a valid `authenticated` JWT with is_anonymous = true. Saved chats
-- and Analyst feedback are for signed-in accounts: their INSERT and UPDATE policies now
-- also require a non-anonymous token. SELECT and DELETE are unchanged, as is app_activity
-- (guests are counted there on purpose). Website users are never anonymous.
--
-- messages has no UPDATE policy (no one updates messages), so only its INSERT changes.

alter policy "Users can create their own conversations" on public.conversations
  with check (
    auth.uid() = user_id
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

alter policy "Users can update their own conversations" on public.conversations
  using (
    auth.uid() = user_id
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    auth.uid() = user_id
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

alter policy "Users can create messages in their conversations" on public.messages
  with check (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id and conversations.user_id = auth.uid()
    )
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

alter policy "Users add their own feedback" on public.analyst_feedback
  with check (
    user_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

alter policy "Users update their own feedback" on public.analyst_feedback
  using (
    user_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    user_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );
