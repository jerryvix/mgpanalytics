import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  /** Scroll this far in one direction before the state flips (hysteresis) */
  threshold?: number;
  /** Always expanded within this distance of the top */
  minTop?: number;
}

/**
 * iOS Safari toolbar behavior for a piece of pinned chrome: collapses after a
 * deliberate scroll down, comes back after a deliberate scroll up (or near the
 * top). Small back-and-forth jiggles below the threshold change nothing, and
 * rubber-band overscroll past either end is ignored.
 *
 * Returns [collapsed, reveal]; reveal() brings it back on demand (a tap) and
 * restarts the hysteresis so the very next scroll pixel can't re-collapse it.
 */
export function useCollapseOnScroll(
  getScroller: () => HTMLElement | null,
  enabled: boolean,
  { threshold = 24, minTop = 120 }: Options = {},
) {
  const [collapsed, setCollapsed] = useState(false);
  const travel = useRef(0); // signed distance moved in the current direction

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false);
      return;
    }
    const el = getScroller();
    if (!el) return;
    let lastY = el.scrollTop;
    travel.current = 0;

    const onScroll = () => {
      const y = el.scrollTop;
      const max = el.scrollHeight - el.clientHeight;
      if (y < 0 || y > max) return; // overscroll bounce
      const dy = y - lastY;
      lastY = y;
      if (y <= minTop) {
        travel.current = 0;
        setCollapsed(false);
        return;
      }
      if (dy === 0) return;
      // a change of direction restarts the count
      if (Math.sign(dy) !== Math.sign(travel.current)) travel.current = 0;
      travel.current += dy;
      if (travel.current > threshold) setCollapsed(true);
      else if (travel.current < -threshold) setCollapsed(false);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [getScroller, enabled, threshold, minTop]);

  const reveal = useCallback(() => {
    travel.current = 0;
    setCollapsed(false);
  }, []);

  return [collapsed, reveal] as const;
}
