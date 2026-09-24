import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useCallback, useRef } from "react";
import { useCollapseOnScroll } from "@/hooks/useCollapseOnScroll";

// Browser-like scroller: scrollTop clamped to 0..(scrollHeight - clientHeight)
// unless a test deliberately overshoots (rubber-band), firing scroll events
function makeScrollable(el: HTMLElement) {
  let top = 0;
  Object.defineProperty(el, "clientHeight", { configurable: true, value: 800 });
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: 10800 });
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = v;
      el.dispatchEvent(new Event("scroll"));
    },
  });
}

function Harness({ enabled = true }: { enabled?: boolean }) {
  const el = useRef<HTMLDivElement | null>(null);
  const setEl = useCallback((node: HTMLDivElement | null) => {
    if (node && node !== el.current) makeScrollable(node);
    el.current = node;
  }, []);
  const getScroller = useCallback(() => el.current, []);
  const [collapsed, reveal] = useCollapseOnScroll(getScroller, enabled);
  return (
    <div ref={setEl} data-testid="scroller">
      <div data-testid="state">{collapsed ? "collapsed" : "expanded"}</div>
      <button onClick={reveal}>Reveal</button>
    </div>
  );
}

function setup(enabled = true) {
  render(<Harness enabled={enabled} />);
  const scroller = screen.getByTestId("scroller");
  const to = (y: number) => act(() => void (scroller.scrollTop = y));
  const state = () => screen.getByTestId("state").textContent;
  return { scroller, to, state };
}

describe("useCollapseOnScroll (sport pills, Safari-toolbar style)", () => {
  it("stays expanded near the top of the page", () => {
    const { to, state } = setup();
    to(60);
    to(110);
    expect(state()).toBe("expanded");
  });

  it("collapses after a deliberate scroll down and comes back after a deliberate scroll up", () => {
    const { to, state } = setup();
    to(300);
    to(900);
    expect(state()).toBe("collapsed");
    to(880); // 20px up: under the 24px threshold
    expect(state()).toBe("collapsed");
    to(850); // 50px up in total
    expect(state()).toBe("expanded");
  });

  it("ignores small jiggles in both directions (hysteresis)", () => {
    const { to, state } = setup();
    to(2000);
    expect(state()).toBe("collapsed");
    for (const y of [1990, 1995, 1985, 1992, 1980]) to(y);
    expect(state()).toBe("collapsed");
  });

  it("always expands when the page is scrolled back near the top", () => {
    const { to, state } = setup();
    to(3000);
    to(100);
    expect(state()).toBe("expanded");
  });

  it("ignores rubber-band overscroll past the bottom", () => {
    const { to, state } = setup();
    to(10000); // the end (10800 - 800)
    expect(state()).toBe("collapsed");
    to(10060); // bounce past the end
    to(10000); // settling back reads as "up" if not ignored
    to(9990);
    expect(state()).toBe("collapsed");
  });

  it("reveal() brings it back and the next small scroll does not re-collapse it", () => {
    const { to, state } = setup();
    to(4000);
    expect(state()).toBe("collapsed");
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(state()).toBe("expanded");
    to(4010); // 10px down: under the threshold
    expect(state()).toBe("expanded");
    to(4040);
    expect(state()).toBe("collapsed");
  });

  it("never collapses when disabled (desktop, non-sports pages)", () => {
    const { to, state } = setup(false);
    to(3000);
    to(6000);
    expect(state()).toBe("expanded");
  });
});
