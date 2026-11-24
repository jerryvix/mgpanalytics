// Images on Analyst questions (bet slips, odds boards, screenshots). The app
// sends them as base64 on a user message; this turns the chat history into
// Anthropic messages with image blocks ahead of the text. Pure (no Deno or
// Supabase imports), so src/test/analystImages.test.ts pins the rules.
//
// Rules:
// - Only the latest IMAGE_TURNS_KEPT user messages carry their images; older
//   ones keep their text and a short note, to save tokens on every turn.
// - At most MAX_IMAGES_PER_MESSAGE images per message.
// - JPEG, PNG and WebP go through. HEIC is not supported by the API, so it is
//   skipped with a note the Analyst can act on (ask for a screenshot).
// - A message without images maps exactly as before: { role, content }.

export type ChatImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

export interface ChatImage {
  mediaType: ChatImageMediaType | string;
  /** base64, no data: prefix */
  data: string;
}

export interface IncomingChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
}

export interface ImageBlock {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface AnthropicChatMessage {
  role: "user" | "assistant";
  content: string | Array<ImageBlock | TextBlock>;
}

export const MAX_IMAGES_PER_MESSAGE = 4;
export const IMAGE_TURNS_KEPT = 2;
/** The API's per-image limit is 10 MB base64-encoded; stay just under it. */
export const MAX_IMAGE_BASE64_CHARS = 10_000_000;

const API_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** "image/jpg" is a common mislabel of JPEG. */
function apiMediaType(mediaType: unknown): ImageBlock["source"]["media_type"] | null {
  const t = String(mediaType ?? "").trim().toLowerCase();
  const fixed = t === "image/jpg" ? "image/jpeg" : t;
  return API_TYPES.has(fixed) ? (fixed as ImageBlock["source"]["media_type"]) : null;
}

/** Base64 with no data: prefix and no whitespace (the API rejects newlines). */
function cleanBase64(data: unknown): string {
  if (typeof data !== "string") return "";
  return data.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A message's images as API blocks, plus a note for each one left out. */
export function imageBlocksFor(images: ChatImage[] | undefined): { blocks: ImageBlock[]; notes: string[] } {
  const blocks: ImageBlock[] = [];
  let heic = 0;
  let unsupported = 0;
  let tooLarge = 0;
  let overLimit = 0;
  for (const img of Array.isArray(images) ? images : []) {
    const rawType = String(img?.mediaType ?? "").trim().toLowerCase();
    if (rawType === "image/heic" || rawType === "image/heif") {
      heic++;
      continue;
    }
    const mediaType = apiMediaType(rawType);
    const data = cleanBase64(img?.data);
    if (!mediaType || !data) {
      unsupported++;
      continue;
    }
    if (data.length > MAX_IMAGE_BASE64_CHARS) {
      tooLarge++;
      continue;
    }
    if (blocks.length >= MAX_IMAGES_PER_MESSAGE) {
      overLimit++;
      continue;
    }
    blocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
  }

  const notes: string[] = [];
  if (heic) {
    notes.push(
      `The user attached ${plural(heic, "HEIC photo", "HEIC photos")}, a format that can't be viewed here. Ask them to resend it as a screenshot (PNG or JPEG).`,
    );
  }
  if (unsupported) {
    notes.push(`${plural(unsupported, "attached image was", "attached images were")} in an unsupported format and couldn't be viewed.`);
  }
  if (tooLarge) {
    notes.push(`${plural(tooLarge, "attached image was", "attached images were")} too large to view. Ask the user for a smaller screenshot.`);
  }
  if (overLimit) {
    notes.push(`Only the first ${MAX_IMAGES_PER_MESSAGE} images are shown; ${plural(overLimit, "more was", "more were")} left out.`);
  }
  return { blocks, notes };
}

function withNotes(text: string, notes: string[]): string {
  if (!notes.length) return text;
  const note = `(Attachment note: ${notes.join(" ")})`;
  return text.trim() ? `${text}\n\n${note}` : note;
}

/**
 * The chat history as Anthropic messages. Images ride only on the latest
 * IMAGE_TURNS_KEPT user messages, before the text block (Claude reads
 * image-then-text best).
 */
export function toAnthropicMessages(messages: IncomingChatMessage[]): AnthropicChatMessage[] {
  const userIdx: number[] = [];
  messages.forEach((m, i) => {
    if (m.role !== "assistant") userIdx.push(i);
  });
  const keepImages = new Set(userIdx.slice(-IMAGE_TURNS_KEPT));

  return messages.map((msg, i) => {
    const role = msg.role === "assistant" ? "assistant" : "user";
    const images = role === "user" && Array.isArray(msg.images) ? msg.images : [];
    // Unchanged from before images existed
    if (!images.length) return { role, content: msg.content };

    const text = typeof msg.content === "string" ? msg.content : "";
    if (!keepImages.has(i)) {
      return {
        role,
        content: withNotes(text, [
          `the user attached ${plural(images.length, "image", "images")} to this message earlier; ${images.length === 1 ? "it is" : "they are"} no longer shown.`,
        ]),
      };
    }

    const { blocks, notes } = imageBlocksFor(images);
    const finalText = withNotes(text, notes);
    if (!blocks.length) return { role, content: finalText };
    const content: Array<ImageBlock | TextBlock> = [...blocks];
    if (finalText.trim()) content.push({ type: "text", text: finalText });
    return { role, content };
  });
}
