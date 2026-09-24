import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A row of tabs or chips that may not fit its column.
 * - Below sm it scrolls inside itself (never the page) with a soft
 *   right-edge fade while more items sit off-screen, so a clipped row still
 *   reads as "there's more" even with the scrollbar hidden.
 * - From sm up nothing clips (overflow visible); the child row is expected
 *   to wrap (e.g. flex-wrap) when the column is narrow.
 */
export function ScrollStrip({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <div ref={ref} className={cn("max-w-full overflow-x-auto scrollbar-hide sm:overflow-visible", className)}>
        {children}
      </div>
      <div
        aria-hidden
        data-scroll-fade
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity duration-200 motion-reduce:transition-none sm:hidden",
          moreRight ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
