/**
 * Daily activity (owner, Nov 24): one row per person per Eastern day in `app_activity`,
 * guest or member, so every install counts and sign-ups can be followed from the first
 * visit. `user_id` comes from the session on the server (default auth.uid(), RLS lets you
 * insert and read only your own rows). Never blocks the app and never shows an error.
 */
import { supabase } from '@/lib/supabase';
import { easternDate } from '@/lib/time';

// What's been sent this run, as "user:day", so each person pings at most once a day
let sent: string | null = null;
let sending: string | null = null;

export async function pingActivity(userId: string | undefined): Promise<void> {
  if (!userId) return;
  const day = easternDate(new Date().toISOString());
  if (!day) return;
  const key = `${userId}:${day}`;
  if (sent === key || sending === key) return;
  sending = key;
  try {
    const { error } = await supabase
      .from('app_activity')
      .upsert({ day, source: 'app' }, { onConflict: 'user_id,day,source', ignoreDuplicates: true });
    // A failure is tried again the next time the app comes to the foreground
    if (!error) sent = key;
  } catch {
    // Offline or the table isn't there: nothing to show
  } finally {
    if (sending === key) sending = null;
  }
}
