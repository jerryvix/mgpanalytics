import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PHONE_MEDIA, DESK_MEDIA } from "@/lib/layoutMedia";
import { useIsMobile } from "@/hooks/use-mobile";

interface Device {
  w: number;
  h: number;
  pointer: "fine" | "coarse" | "none";
}

// Minimal evaluator for the query shapes used here: comma-separated lists of
// "and"-joined (min|max)-(width|height) and pointer features
function matches(query: string, d: Device): boolean {
  return query.split(",").some((part) =>
    part
      .trim()
      .split(/\s+and\s+/)
      .every((feature) => {
        const m = feature.match(/^\((min|max)-(width|height):\s*([\d.]+)px\)$|^\(pointer:\s*(\w+)\)$/);
        if (!m) throw new Error(`unsupported feature ${feature}`);
        if (m[4]) return d.pointer === m[4];
        const actual = m[2] === "width" ? d.w : d.h;
        const limit = Number(m[3]);
        return m[1] === "min" ? actual >= limit : actual <= limit;
      })
  );
}

const devices: Record<string, [Device, "phone" | "desk"]> = {
  "iPhone 13 mini portrait": [{ w: 375, h: 812, pointer: "coarse" }, "phone"],
  "iPhone 14 landscape": [{ w: 844, h: 390, pointer: "coarse" }, "phone"],
  "iPhone 15 Pro Max landscape": [{ w: 932, h: 430, pointer: "coarse" }, "phone"],
  "iPhone in landscape Safari (toolbars shown)": [{ w: 852, h: 340, pointer: "coarse" }, "phone"],
  "iPad mini portrait": [{ w: 744, h: 1133, pointer: "coarse" }, "phone"], // under 768: phone as before
  "iPad Air portrait": [{ w: 820, h: 1180, pointer: "coarse" }, "desk"],
  "iPad Air landscape": [{ w: 1180, h: 820, pointer: "coarse" }, "desk"],
  "desktop": [{ w: 1440, h: 900, pointer: "fine" }, "desk"],
  "short desktop window": [{ w: 1200, h: 450, pointer: "fine" }, "desk"],
  "narrow desktop window": [{ w: 700, h: 900, pointer: "fine" }, "phone"],
  "TV, no pointer": [{ w: 1920, h: 1080, pointer: "none" }, "desk"],
  "short screen, no pointer": [{ w: 1024, h: 400, pointer: "none" }, "desk"],
};

describe("phone vs desktop chrome", () => {
  it.each(Object.entries(devices))("%s", (_name, [device, expected]) => {
    const phone = matches(PHONE_MEDIA, device);
    const desk = matches(DESK_MEDIA, device);
    // exactly one chrome, never both, never neither
    expect(phone).toBe(!desk);
    expect(phone ? "phone" : "desk").toBe(expected);
  });

  it("the Tailwind phone:/desk: variants and the 16px input rule use the same media", () => {
    const tw = readFileSync(path.resolve(__dirname, "../../tailwind.config.ts"), "utf8");
    expect(tw).toMatch(/addVariant\("phone", `@media \$\{PHONE_MEDIA\}`\)/);
    expect(tw).toMatch(/addVariant\("desk", `@media \$\{DESK_MEDIA\}`\)/);
    const css = readFileSync(path.resolve(__dirname, "../index.css"), "utf8");
    expect(css).toContain(`@media ${PHONE_MEDIA} {`);
  });
});

describe("useIsMobile", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubMedia = (phone: boolean) =>
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q === PHONE_MEDIA ? phone : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

  it("is true whenever the phone media matches (including landscape phones)", () => {
    stubMedia(true);
    expect(renderHook(() => useIsMobile()).result.current).toBe(true);
  });

  it("is false for desktop and tablets", () => {
    stubMedia(false);
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
  });
});
