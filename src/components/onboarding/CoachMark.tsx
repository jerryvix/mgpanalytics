import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";

interface CoachMarkProps {
  targetSelector: string;
  title: string;
  description: string;
  stepNumber: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
}

export function CoachMark({
  targetSelector,
  title,
  description,
  stepNumber,
  totalSteps,
  onNext,
  onSkip,
}: CoachMarkProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const updatePosition = useCallback(() => {
    const el = document.querySelector(targetSelector);
    const rect = el?.getBoundingClientRect();
    // A hidden target (display:none reports 0×0) must not summon the overlay —
    // a full-screen barrier with no visible anchor traps every tap on the page.
    if (rect && rect.width > 0 && rect.height > 0) {
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [targetSelector]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  if (!targetRect) return null;

  const padding = 8;
  const spotlightX = targetRect.left - padding;
  const spotlightY = targetRect.top - padding;
  const spotlightW = targetRect.width + padding * 2;
  const spotlightH = targetRect.height + padding * 2;

  // Position tooltip below target by default, above if near bottom — and
  // always clamp fully inside the viewport (iOS Safari's dynamic toolbars
  // shrink innerHeight; an off-screen tooltip would leave the user trapped
  // behind the click barrier with no reachable buttons).
  const tooltipBelow = targetRect.bottom + 180 < window.innerHeight;
  const rawTop = tooltipBelow ? targetRect.bottom + 12 : targetRect.top - 180;
  const tooltipTop = Math.max(8, Math.min(rawTop, window.innerHeight - 190));
  const tooltipLeft = Math.max(16, Math.min(targetRect.left, window.innerWidth - 320));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[100]"
    >
      {/* Overlay with spotlight cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
        <defs>
          <mask id="coach-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={spotlightX}
              y={spotlightY}
              width={spotlightW}
              height={spotlightH}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#coach-mask)"
        />
      </svg>

      {/* Tap barrier — tapping anywhere outside the tooltip advances the tour
          (standard mobile pattern). A dead barrier is a trap: if the tooltip
          ever renders off-position, the user has no way to dismiss it. */}
      <div
        className="absolute inset-0"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
      />

      {/* Tooltip */}
      <motion.div
        initial={{ opacity: 0, y: tooltipBelow ? -8 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.25 }}
        className="absolute z-[101] w-72 bg-card border border-terminal-green/30 rounded-lg p-4 shadow-xl"
        style={{ top: tooltipTop, left: tooltipLeft }}
      >
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
        <div className="flex items-center justify-between mt-4">
          <span className="text-[10px] text-muted-foreground">
            {stepNumber} of {totalSteps}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              Skip
            </button>
            <button
              onClick={onNext}
              className="text-xs bg-terminal-green text-background px-3 py-1 rounded font-medium hover:bg-terminal-green/90 transition-colors"
            >
              {stepNumber === totalSteps ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
