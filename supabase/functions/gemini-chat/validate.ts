// Input checks for an Analyst request (audit S1), run before the daily quota and any
// model call. Pure (no Deno or Supabase imports), so src/test/analystRequest.test.ts
// pins the rules.
//
// Rejected with 400 (the caller sends { error }):
// - a body that isn't an object, or `messages` that isn't a non-empty array
// - more than MAX_MESSAGES_ACCEPTED messages
// - a message whose role isn't "user" or "assistant", or whose content isn't a string
//   (content blocks would let a caller hand the model arbitrary block types)
// - images anywhere but the `images` field of a user message, more than
//   MAX_IMAGES_PER_MESSAGE on one message, or an image that isn't { mediaType, data }
//   strings (format, size and HEIC are then handled by images.ts as before)
// - a conversation that doesn't end on a user message, or whose latest user message
//   is empty (and has no images) or longer than MAX_LATEST_CHARS
// - `activeSports` that isn't a short list of short strings
//
// What the model sees: the latest MAX_MESSAGES messages, then the oldest dropped
// until their text is at most MAX_TOTAL_CHARS, starting on a user turn (the API's
// first message must be the user's). Both apps send the whole conversation, so a
// long chat keeps working on its most recent turns instead of failing.

import { type ChatImage, MAX_IMAGES_PER_MESSAGE } from "./images.ts";

/** Messages sent to the model per request. */
export const MAX_MESSAGES = 20;
/** The latest user message (the question being asked). */
export const MAX_LATEST_CHARS = 4000;
/** All message text sent to the model in one request. */
export const MAX_TOTAL_CHARS = 30_000;
/** Hard cap on the history a client may send; the model still sees MAX_MESSAGES. */
export const MAX_MESSAGES_ACCEPTED = 200;
const MAX_ACTIVE_SPORTS = 10;

export interface ValidMessage {
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
}

export interface ValidRequest {
  /** The window the model sees (MAX_MESSAGES, MAX_TOTAL_CHARS, user first). */
  messages: ValidMessage[];
  activeSports?: string[];
  webSearchEnabled?: boolean;
}

export type RequestCheck = { ok: true; value: ValidRequest } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function checkImages(raw: unknown, index: number): { images?: ChatImage[]; error?: string } {
  if (raw === undefined || raw === null) return {};
  if (!Array.isArray(raw)) return { error: `messages[${index}].images must be an array` };
  if (raw.length > MAX_IMAGES_PER_MESSAGE) {
    return { error: `At most ${MAX_IMAGES_PER_MESSAGE} images per message` };
  }
  const images: ChatImage[] = [];
  for (const img of raw) {
    if (!isObject(img) || typeof img.mediaType !== "string" || typeof img.data !== "string") {
      return { error: `messages[${index}].images must be { mediaType, data } strings` };
    }
    images.push({ mediaType: img.mediaType, data: img.data });
  }
  return images.length ? { images } : {};
}

/** Checks the request body and returns the clean window the model should see. */
export function validateChatRequest(body: unknown): RequestCheck {
  if (!isObject(body)) return { ok: false, error: "Request body must be a JSON object" };
  const raw = body.messages;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "messages must be a non-empty array" };
  }
  if (raw.length > MAX_MESSAGES_ACCEPTED) {
    return { ok: false, error: `Too many messages (at most ${MAX_MESSAGES_ACCEPTED})` };
  }

  const clean: ValidMessage[] = [];
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i];
    if (!isObject(m)) return { ok: false, error: `messages[${i}] must be an object` };
    if (m.role !== "user" && m.role !== "assistant") {
      return { ok: false, error: `messages[${i}].role must be "user" or "assistant"` };
    }
    if (typeof m.content !== "string") {
      return { ok: false, error: `messages[${i}].content must be a string` };
    }
    if (m.role === "assistant" && m.images !== undefined && m.images !== null) {
      return { ok: false, error: `messages[${i}]: images are allowed on user messages only` };
    }
    const { images, error } = checkImages(m.images, i);
    if (error) return { ok: false, error };
    clean.push(images ? { role: m.role, content: m.content, images } : { role: m.role, content: m.content });
  }

  const latest = clean[clean.length - 1];
  if (latest.role !== "user") return { ok: false, error: "The last message must be from the user" };
  if (!latest.content.trim() && !latest.images?.length) {
    return { ok: false, error: "The question is empty" };
  }
  if (latest.content.length > MAX_LATEST_CHARS) {
    return { ok: false, error: `The question is too long (at most ${MAX_LATEST_CHARS} characters)` };
  }

  let activeSports: string[] | undefined;
  if (body.activeSports !== undefined && body.activeSports !== null) {
    const s = body.activeSports;
    if (!Array.isArray(s) || s.length > MAX_ACTIVE_SPORTS || !s.every((x) => typeof x === "string" && x.length <= 16)) {
      return { ok: false, error: "activeSports must be a short list of sport names" };
    }
    activeSports = s as string[];
  }
  const webSearchEnabled = typeof body.webSearchEnabled === "boolean" ? body.webSearchEnabled : undefined;

  return { ok: true, value: { messages: modelWindow(clean), activeSports, webSearchEnabled } };
}

/**
 * The latest MAX_MESSAGES messages whose text fits in MAX_TOTAL_CHARS, newest kept
 * first, starting on a user message. The latest message (a user message of at most
 * MAX_LATEST_CHARS) is always kept.
 */
export function modelWindow(messages: ValidMessage[]): ValidMessage[] {
  const kept: ValidMessage[] = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0 && kept.length < MAX_MESSAGES; i--) {
    const len = messages[i].content.length;
    if (kept.length && chars + len > MAX_TOTAL_CHARS) break;
    kept.unshift(messages[i]);
    chars += len;
  }
  while (kept.length > 1 && kept[0].role !== "user") kept.shift();
  return kept;
}
