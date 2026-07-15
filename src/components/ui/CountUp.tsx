import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CountUpProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number; // seconds
  className?: string;
}

// Ticks a number up when it scrolls into view — the Bloomberg-terminal touch.
// tabular-nums keeps digit widths fixed so nothing shifts while animating.
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", duration = 0.8, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  // Animate from whatever is currently shown, so refetches tick between values
  const shownRef = useRef(reduced ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      shownRef.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(shownRef.current, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        shownRef.current = v;
        setDisplay(v);
      },
    });
    return () => controls.stop();
  }, [inView, value, reduced, duration]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
