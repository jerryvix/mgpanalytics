/**
 * Analyst chat history (D-094), in the same `conversations` and `messages` tables the website
 * uses, so a chat started on the phone shows up on mgp-analytics.com and the other way round.
 * Everyone reads and writes only their own rows (RLS). Images aren't stored, only the text.
 */
import { supabase } from '@/lib/supabase';

export type StoredSource = { title: string; url: string };
export type StoredMsg = { role: 'user' | 'assistant'; content: string; sources?: StoredSource[] };
export type Conversation = { id: string; title: string; updated_at: string };

export async function createConversation(userId: string, firstQuestion: string): Promise<string | null> {
  const title = firstQuestion.replace(/\s+/g, ' ').trim().slice(0, 80) || 'New Chat';
  const { data, error } = await supabase.from('conversations').insert({ user_id: userId, title }).select('id').single();
  return error ? null : (data?.id as string);
}

export async function addMessage(conversationId: string, msg: StoredMsg): Promise<void> {
  const row: Record<string, unknown> = { conversation_id: conversationId, role: msg.role, content: msg.content };
  const { error } = await supabase.from('messages').insert(msg.sources?.length ? { ...row, sources: msg.sources } : row);
  // If the sources column isn't there, keep the text anyway
  if (error && msg.sources?.length) await supabase.from('messages').insert(row);
  await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
}

export async function listConversations(): Promise<Conversation[]> {
  const { data } = await supabase.from('conversations').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(100);
  return (data ?? []) as Conversation[];
}

export async function loadMessages(conversationId: string): Promise<StoredMsg[]> {
  const { data } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
  return (data ?? []).map((m: { role: string; content: string; sources?: StoredSource[] | null }) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
    sources: Array.isArray(m.sources) ? m.sources : undefined,
  }));
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await supabase.from('messages').delete().eq('conversation_id', conversationId);
  await supabase.from('conversations').delete().eq('id', conversationId);
}
