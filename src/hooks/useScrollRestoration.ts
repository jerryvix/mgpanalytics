import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Scroll memory for the dashboard's scroll container (<main>, which scrolls
// instead of the window, so the browser's own restoration never applies).
//
// - Forward navigation to another screen (PUSH/REPLACE with a new path)
//   starts it at the top, instead of inheriting the last screen's offset.
// - Back/Forward (POP) returns to where that history entry was left, waiting
//   for late-loading content if the page is still too short to reach it.
//
// Positions are keyed by React Router's location.key, kept in memory and
// mirrored to sessionStorage so a reload of the tab restores too. Storage
// errors (private mode, quota) are ignored.

const STORAGE_KEY = "mgp-scroll-positions";
const MAX_ENTRIES = 50;
// React Router's key for the entry a fresh page load starts on. Unique within
// one load (so it is remembered in memory: open MLB, scroll, NFL, Back must
// work), but every load reuses it, so it is never written to sessionStorage
// where it would restore one page's offset onto another.
const LOAD_KEY = "default";

let memory: Map<string, number> | null = null;

function positions(): Map<string, number> {
  if (!memory) {
    memory = new Map();
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) memory = new Map(JSON.parse(raw) as [string, number][]);
    } catch {
      // storage unavailable or corrupt: start empty
    }
  }
  return memory;
}

function remember(key: string, y: number) {
  const map = positions();
  map.delete(key); // re-insert so the map stays in recency order
  map.set(key, y);
  while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value as string);
}

function persist() {
  try {
    const entries = [...positions()].filter(([key]) => key !== LOAD_KEY);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage unavailable: memory still works for this session
  }
}

/** Test hook: forget everything (memory and storage). */
export function resetScrollMemory() {
  memory = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Scrolls to y, re-applying as the content grows (data arriving after the
// page mounts) until it gets there, the user takes over, or 4s pass.
function restoreTo(el: HTMLElement, y: number): () => void {
  let done = false;
  const content = el.firstElementChild;
  const ro = typeof ResizeObserver !== "undefined" && content ? new ResizeObserver(() => apply()) : null;
  const timer = window.setTimeout(() => finish(), 4000);
  const userTookOver = () => finish();

  function finish() {
    if (done) return;
    done = true;
    ro?.disconnect();
    window.clearTimeout(timer);
    el.removeEventListener("touchstart", userTookOver);
    el.removeEventListener("wheel", userTookOver);
    window.removeEventListener("keydown", userTookOver);
  }
  function apply() {
    if (done) return;
    el.scrollTop = y;
    if (Math.abs(el.scrollTop - y) <= 1) finish();
  }

  if (ro && content) ro.observe(content);
  el.addEventListener("touchstart", userTookOver, { passive: true });
  el.addEventListener("wheel", userTookOver, { passive: true });
  window.addEventListener("keydown", userTookOver);
  apply();
  return finish;
}

export function useScrollRestoration(getScroller: () => HTMLElement | null) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const keyRef = useRef(location.key);
  const pathRef = useRef(location.pathname);

  // Track the on-screen entry's position as the user scrolls
  useEffect(() => {
    const el = getScroller();
    if (!el) return;
    const onScroll = () => remember(keyRef.current, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", persist);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persist);
    };
  }, [getScroller]);

  // Before paint on every navigation: top for new screens, saved spot for
  // Back/Forward
  useLayoutEffect(() => {
    const pathChanged = location.pathname !== pathRef.current;
    keyRef.current = location.key;
    pathRef.current = location.pathname;
    persist();

    const el = getScroller();
    if (!el) return;
    if (navigationType === "POP") {
      const y = positions().get(location.key);
      if (y !== undefined) return restoreTo(el, y);
    } else if (pathChanged) {
      el.scrollTop = 0;
    }
    // Only the entry changing matters; the other values are read fresh here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
}
