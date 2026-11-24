/**
 * Analyst chat history (D-094), in the same `conversations` and `messages` tables the website
 * uses, so a chat started on the phone shows up on mgp-analytics.com and the other way round.
 * Everyone reads and writes only their own rows (RLS). Images aren't stored, only the text.
 */
import { supabase } from '@/lib/supabase';

export type StoredSource = { title: string; url: string };
export type StoredMsg = { role: 'user' | 'assistant'; content: string; sources?: StoredSource[] };
export type Conversation = { id: string; title: string; updated_at: string };

/** Start a saved chat. Its id, or null when it couldn't be created. */
export async function createConversation(userId: string, firstQuestion: string): Promise<string | null> {
  const title = firstQuestion.replace(/\s+/g, ' ').trim().slice(0, 80) || 'New Chat';
  try {
    const { data, error } = await supabase.from('conversations').insert({ user_id: userId, title }).select('id').single();
    return error || !data?.id ? null : (data.id as string);
  } catch {
    return null;
  }
}

/**
 * Save one message. True when it saved; false when it didn't (for example the chat was
 * deleted from History), so the caller can start a new chat and save there.
 */
export async function addMessage(conversationId: string, msg: StoredMsg): Promise<boolean> {
  const row: Record<string, unknown> = { conversation_id: conversationId, role: msg.role, content: msg.content };
  const insert = async (r: Record<string, unknown>) => {
    // Return the saved row: an insert the database quietly skips comes back with none
    const { data, error } = await supabase.from('messages').insert(r).select('id');
    return !error && Array.isArray(data) && data.length > 0;
  };
  let saved = false;
  try {
    saved = await insert(msg.sources?.length ? { ...row, sources: msg.sources } : row);
    // If the sources column isn't there, keep the text anyway
    if (!saved && msg.sources?.length) saved = await insert(row);
  } catch {
    return false;
  }
  if (saved) {
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId).then(() => undefined, () => undefined);
  }
  return saved;
}

/** Your chats, newest first. Throws when they can't be read, so History can say so. */
export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.from('conversations').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as Conversation[];
}

/** One chat's messages, oldest first. Throws when they can't be read. */
export async function loadMessages(conversationId: string): Promise<StoredMsg[]> {
  const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m: { role: string; content: string; sources?: StoredSource[] | null }) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
    sources: Array.isArray(m.sources) ? m.sources : undefined,
  }));
}

/** Delete a chat and its messages. True when it's gone. */
export async function deleteConversation(conversationId: string): Promise<boolean> {
  try {
    const msgs = await supabase.from('messages').delete().eq('conversation_id', conversationId);
    if (msgs.error) return false;
    const conv = await supabase.from('conversations').delete().eq('id', conversationId);
    return !conv.error;
  } catch {
    return false;
  }
}
