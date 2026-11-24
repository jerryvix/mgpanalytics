import { describe, expect, it } from "vitest";
import {
  IMAGE_TURNS_KEPT,
  MAX_IMAGES_PER_MESSAGE,
  toAnthropicMessages,
  type IncomingChatMessage,
} from "../../supabase/functions/gemini-chat/images";

const png = (data = "iVBORw0KGgo=") => ({ mediaType: "image/png", data });

describe("The Analyst's image messages (gemini-chat/images.ts)", () => {
  it("maps text-only messages exactly as before", () => {
    const msgs: IncomingChatMessage[] = [
      { role: "user", content: "Bills ATS this season?" },
      { role: "assistant", content: "The Bills are 6-4 ATS." },
      { role: "user", content: "And at home?" },
    ];
    expect(toAnthropicMessages(msgs)).toEqual([
      { role: "user", content: "Bills ATS this season?" },
      { role: "assistant", content: "The Bills are 6-4 ATS." },
      { role: "user", content: "And at home?" },
    ]);
  });

  it("puts images before the text as base64 blocks", () => {
    const [m] = toAnthropicMessages([
      { role: "user", content: "What's on this slip?", images: [png("AAA"), { mediaType: "image/jpeg", data: "BBB" }] },
    ]);
    expect(m.content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "BBB" } },
      { type: "text", text: "What's on this slip?" },
    ]);
  });

  it("keeps at most four images on a message and notes the rest", () => {
    const [m] = toAnthropicMessages([
      { role: "user", content: "Boards", images: Array.from({ length: 6 }, () => png()) },
    ]);
    const blocks = m.content as Array<{ type: string; text?: string }>;
    expect(blocks.filter((b) => b.type === "image")).toHaveLength(MAX_IMAGES_PER_MESSAGE);
    expect(blocks.at(-1)?.text).toContain("Only the first 4 images are shown; 2 more were left out.");
  });

  it("keeps images only on the latest two user messages", () => {
    const msgs: IncomingChatMessage[] = [
      { role: "user", content: "First slip", images: [png()] },
      { role: "assistant", content: "Read it." },
      { role: "user", content: "Second slip", images: [png()] },
      { role: "assistant", content: "Read it." },
      { role: "user", content: "Third slip", images: [png(), png()] },
    ];
    const out = toAnthropicMessages(msgs);
    expect(IMAGE_TURNS_KEPT).toBe(2);
    expect(out[0].content).toBe(
      "First slip\n\n(Attachment note: the user attached 1 image to this message earlier; it is no longer shown.)",
    );
    expect(Array.isArray(out[2].content)).toBe(true);
    expect(Array.isArray(out[4].content)).toBe(true);
    expect((out[4].content as unknown[]).length).toBe(3);
  });

  it("skips HEIC with a note asking for a screenshot", () => {
    const [m] = toAnthropicMessages([
      { role: "user", content: "Thoughts on this?", images: [{ mediaType: "image/heic", data: "AAA" }] },
    ]);
    expect(typeof m.content).toBe("string");
    expect(m.content).toContain("Thoughts on this?");
    expect(m.content).toContain("1 HEIC photo");
    expect(m.content).toContain("resend it as a screenshot (PNG or JPEG)");
  });

  it("keeps readable images next to a skipped HEIC", () => {
    const [m] = toAnthropicMessages([
      { role: "user", content: "Two boards", images: [{ mediaType: "image/heic", data: "AAA" }, { mediaType: "image/webp", data: "CCC" }] },
    ]);
    const blocks = m.content as Array<{ type: string; text?: string; source?: { media_type: string } }>;
    expect(blocks[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/webp", data: "CCC" } });
    expect(blocks[1].text).toContain("HEIC");
  });

  it("sends an image-only message without an empty text block", () => {
    const [m] = toAnthropicMessages([{ role: "user", content: "", images: [png("AAA")] }]);
    expect(m.content).toEqual([{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } }]);
  });

  it("strips a data: prefix and whitespace from the base64", () => {
    const [m] = toAnthropicMessages([
      { role: "user", content: "Slip", images: [{ mediaType: "image/png", data: "data:image/png;base64,AA\nBB" }] },
    ]);
    expect((m.content as Array<{ source?: { data: string } }>)[0].source?.data).toBe("AABB");
  });

  it("ignores images on assistant messages", () => {
    const out = toAnthropicMessages([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello", images: [png()] },
    ]);
    expect(out[1]).toEqual({ role: "assistant", content: "Hello" });
  });
});
