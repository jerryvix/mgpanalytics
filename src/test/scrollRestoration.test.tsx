import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useCallback, useRef } from "react";
import { MemoryRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { useScrollRestoration, resetScrollMemory } from "@/hooks/useScrollRestoration";

// jsdom has no layout, so the scroller gets a browser-like scrollTop: clamped
// to the content height (layout.max), firing a scroll event when it moves
const layout = { max: 20000 };
function makeScrollable(el: HTMLElement) {
  let top = 0;
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      const next = Math.max(0, Math.min(v, layout.max));
      if (next !== top) {
        top = next;
        el.dispatchEvent(new Event("scroll"));
      }
    },
  });
}

// ResizeObserver stand-in: the test decides when the content "grows"
class FakeResizeObserver {
  static live: FakeResizeObserver[] = [];
  constructor(private cb: () => void) {
    FakeResizeObserver.live.push(this);
  }
  observe() {}
  disconnect() {
    FakeResizeObserver.live = FakeResizeObserver.live.filter((o) => o !== this);
  }
  static grow(max: number) {
    layout.max = max;
    act(() => [...FakeResizeObserver.live].forEach((o) => o.cb()));
  }
}

function Probe() {
  return <div data-testid="path">{useLocation().pathname + useLocation().search}</div>;
}

function Screens({ getScroller }: { getScroller: () => HTMLElement | null }) {
  useScrollRestoration(getScroller);
  const navigate = useNavigate();
  return (
    <div>
      <Link to="/dashboard/nfl">NFL</Link>
      <Link to="/dashboard/mlb/players">MLB Players</Link>
      <Link to="/dashboard/mlb?view=odds">Odds view</Link>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </div>
  );
}

function Shell() {
  const el = useRef<HTMLDivElement | null>(null);
  const setEl = useCallback((node: HTMLDivElement | null) => {
    if (node && node !== el.current) makeScrollable(node);
    el.current = node;
  }, []);
  const getScroller = useCallback(() => el.current, []);
  return (
    <div ref={setEl} data-testid="scroller">
      <Screens getScroller={getScroller} />
    </div>
  );
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Shell />
    </MemoryRouter>
  );
  return screen.getByTestId("scroller");
}

const scrollTo = (el: HTMLElement, y: number) => act(() => void (el.scrollTop = y));
const tap = (name: string) => fireEvent.click(screen.getByRole(/^(Back|Forward)$/.test(name) ? "button" : "link", { name }));

beforeEach(() => {
  resetScrollMemory();
  layout.max = 20000;
  FakeResizeObserver.live = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("dashboard scroll restoration", () => {
  // QC: from the bottom of MLB, NCAAF opened at 11132 with its heading far
  // above the screen
  it("opens a new screen at the top", () => {
    const scroller = renderAt("/dashboard/mlb");
    scrollTo(scroller, 11132);
    tap("NFL");
    expect(screen.getByTestId("path")).toHaveTextContent("/dashboard/nfl");
    expect(scroller.scrollTop).toBe(0);
  });

  it("Back returns to where you were, and Forward to where you left the next screen", () => {
    const scroller = renderAt("/dashboard/mlb");
    scrollTo(scroller, 5000);
    tap("NFL");
    scrollTo(scroller, 300);
    tap("Back");
    expect(screen.getByTestId("path")).toHaveTextContent("/dashboard/mlb");
    expect(scroller.scrollTop).toBe(5000);
    tap("Forward");
    expect(screen.getByTestId("path")).toHaveTextContent("/dashboard/nfl");
    expect(scroller.scrollTop).toBe(300);
  });

  it("waits for late-loading content before restoring the spot", () => {
    const scroller = renderAt("/dashboard/mlb");
    scrollTo(scroller, 5000);
    tap("NFL");
    layout.max = 0; // MLB remounts short: its games are still loading
    tap("Back");
    expect(scroller.scrollTop).toBe(0);
    FakeResizeObserver.grow(12000); // the slate arrives
    expect(scroller.scrollTop).toBe(5000);
  });

  it("lets the user take over instead of yanking the page later", () => {
    const scroller = renderAt("/dashboard/mlb");
    scrollTo(scroller, 5000);
    tap("NFL");
    layout.max = 0;
    tap("Back");
    fireEvent.touchStart(scroller);
    FakeResizeObserver.grow(12000);
    expect(scroller.scrollTop).toBe(0);
  });

  it("keeps the position when only the query string changes", () => {
    const scroller = renderAt("/dashboard/mlb");
    scrollTo(scroller, 400);
    tap("Odds view");
    expect(screen.getByTestId("path")).toHaveTextContent("/dashboard/mlb?view=odds");
    expect(scroller.scrollTop).toBe(400);
  });

  // A fresh load's first entry always has React Router's key "default", so it
  // lives in memory only; stored, it would land one page's offset on another
  it("remembers the first entry in memory but never stores its shared key", () => {
    const scroller = renderAt("/dashboard/mlb"); // first entry: key "default"
    scrollTo(scroller, 5000);
    tap("NFL");
    scrollTo(scroller, 700);
    tap("MLB Players"); // persists on navigation
    const stored = new Map(JSON.parse(sessionStorage.getItem("mgp-scroll-positions") ?? "[]") as [string, number][]);
    expect(stored.has("default")).toBe(false);
    expect([...stored.values()]).toContain(700); // the NFL entry (real key)
    tap("Back");
    tap("Back");
    expect(screen.getByTestId("path")).toHaveTextContent("/dashboard/mlb");
    expect(scroller.scrollTop).toBe(5000); // from memory
  });

  // e.g. MLB opened fresh (its spot lives in memory only), NFL reloaded, then
  // Back: nothing saved for MLB, so it must not inherit NFL's offset
  it("Back to a screen with no saved spot opens it at the top", () => {
    const scroller = renderAt("/dashboard/mlb");
    tap("NFL");
    scrollTo(scroller, 900);
    resetScrollMemory(); // what a reload of NFL leaves behind for MLB
    tap("Back");
    expect(screen.getByTestId("path")).toHaveTextContent("/dashboard/mlb");
    expect(scroller.scrollTop).toBe(0);
  });

  it("keeps working when sessionStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const scroller = renderAt("/dashboard/mlb");
    scrollTo(scroller, 2500);
    tap("MLB Players");
    expect(scroller.scrollTop).toBe(0);
    tap("Back");
    expect(scroller.scrollTop).toBe(2500);
  });
});
