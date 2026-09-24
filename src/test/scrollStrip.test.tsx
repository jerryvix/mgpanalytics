import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ScrollStrip } from "@/components/ui/ScrollStrip";

// jsdom has no layout: give the strip a 300px viewport over 560px of tabs
function layoutStrip(el: HTMLElement) {
  let left = 0;
  Object.defineProperty(el, "clientWidth", { configurable: true, value: 300 });
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: 560 });
  Object.defineProperty(el, "scrollLeft", {
    configurable: true,
    get: () => left,
    set: (v: number) => {
      left = Math.max(0, Math.min(v, 260));
      el.dispatchEvent(new Event("scroll"));
    },
  });
}

function setup() {
  const { container } = render(
    <ScrollStrip>
      <div style={{ width: 560 }}>tabs</div>
    </ScrollStrip>
  );
  const fade = container.querySelector("[data-scroll-fade]") as HTMLElement;
  const strip = fade.previousElementSibling as HTMLElement;
  layoutStrip(strip);
  act(() => void (strip.scrollLeft = 0)); // first measure with layout
  return { strip, fade };
}

describe("ScrollStrip (tabs that may not fit)", () => {
  it("scrolls inside itself on phones and wraps from sm up, never clipping silently", () => {
    const { strip, fade } = setup();
    expect(strip.className).toMatch(/\boverflow-x-auto\b/);
    expect(strip.className).toContain("sm:overflow-visible");
    expect(fade.className).toContain("sm:hidden");
    expect(fade).toHaveAttribute("aria-hidden");
  });

  it("shows the right-edge fade while more tabs sit off-screen, hides it at the end", () => {
    const { strip, fade } = setup();
    expect(fade.className).toMatch(/\bopacity-100\b/);
    act(() => void (strip.scrollLeft = 260)); // scrolled to the last tab
    expect(fade.className).toMatch(/\bopacity-0\b/);
    act(() => void (strip.scrollLeft = 100));
    expect(fade.className).toMatch(/\bopacity-100\b/);
  });

  it("NFL Players' tab list wraps from sm up inside the strip", () => {
    const src = readFileSync(path.resolve(__dirname, "../pages/NFLPlayers.tsx"), "utf8");
    expect(src).toMatch(/<ScrollStrip>\s*<TabsList className="[^"]*\bsm:flex-wrap\b[^"]*">/);
    expect(src).toMatch(/<TabsList className="[^"]*\bsm:w-auto\b[^"]*\bsm:max-w-full\b[^"]*">/);
    expect(src).toMatch(/<\/TabsList>\s*<\/ScrollStrip>/);
  });
});
