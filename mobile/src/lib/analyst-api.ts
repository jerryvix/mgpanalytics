/**
 * One call to The Analyst (`gemini-chat`, D-080), made with a plain fetch so every step
 * reports what went wrong (D-090). A failed call is logged to `api_request_log`
 * (provider `mgp-app`, the person's own row) so it can be looked into without a screenshot.
 * A 429 is either the 10 a minute burst limit (`busy`) or the 50 a day cap (`daily`, body
 * { error: "Daily limit reached" }, resets at midnight Eastern; D-099).
 */
import { PUBLISHABLE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';

export type Source = { title: string; url: string };
export type AnalystReply =
  | { ok: true; content: string; sources: Source[] }
  | { ok: false; busy: boolean; daily: boolean; reason: string };

const TIMEOUT_MS = 120_000; // a web search answer can take a while

async function logFailure(userId: string | undefined, status: number | null, ms: number, reason: string) {
  if (!userId) return;
  await supabase.from('api_request_log').insert({
    user_id: userId, provider: 'mgp-app', endpoint: 'gemini-chat', status_code: status, duration_ms: ms, error_message: reason.slice(0, 300),
  }).then(() => undefined, () => undefined);
}

export type OutMsg = { role: 'user' | 'assistant'; content: string; images?: { mediaType: string; data: string }[] };

export async function askAnalyst(messages: OutMsg[]): Promise<AnalystReply> {
  const started = Date.now();
  let status: number | null = null;
  let userId: string | undefined;
  const fail = async (reason: string, busy = false, daily = false): Promise<AnalystReply> => {
    await logFailure(userId, status, Date.now() - started, reason);
    return { ok: false, busy, daily, reason };
  };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    userId = data.session?.user.id;
    if (!token) return fail('no session');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let raw = '';
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: ctrl.signal,
      });
      status = res.status;
      raw = await res.text();
    } finally {
      clearTimeout(timer);
    }
    if (status === 429) {
      let error = '';
      try {
        const body = JSON.parse(raw) as { error?: unknown };
        error = typeof body.error === 'string' ? body.error : '';
      } catch {
        // Not JSON: treat it as the burst limit
      }
      return /daily limit/i.test(error) ? fail('daily limit', false, true) : fail('rate limited', true);
    }
    if (status === null || status < 200 || status >= 300) return fail(`http ${status}`);
    let body: { content?: unknown; sources?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(`unreadable reply (${raw.length} chars)`);
    }
    if (typeof body.content !== 'string' || !body.content.trim()) return fail('empty reply');
    const sources = Array.isArray(body.sources) ? (body.sources as Source[]).filter((s) => s && typeof s.url === 'string') : [];
    return { ok: true, content: body.content, sources };
  } catch (e) {
    const name = e instanceof Error ? e.name : 'Error';
    const msg = e instanceof Error ? e.message : String(e);
    return fail(name === 'AbortError' ? 'timed out' : `${name}: ${msg}`);
  }
}
