import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Zap } from "lucide-react";
import { DeltaResult, getDeltaBadgeStyles, SURGE_THRESHOLD, SLUMP_THRESHOLD } from "@/utils/performanceDelta";

interface PerformanceSurgeBadgeProps {
  delta: DeltaResult | null;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PerformanceSurgeBadge({
  delta,
  showLabel = true,
  size = "md",
  className = "",
}: PerformanceSurgeBadgeProps) {
  if (!delta || (!delta.isSurge && !delta.isSlump)) {
    return null;
  }

  const styles = getDeltaBadgeStyles(delta.delta);
  
  const sizeClasses = {
    sm: "text-[10px] px-1.5 py-0.5 gap-0.5",
    md: "text-xs px-2 py-1 gap-1",
    lg: "text-sm px-2.5 py-1.5 gap-1.5",
  };

  const iconSize = {
    sm: "w-2.5 h-2.5",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  if (delta.isSurge) {
    return (
      <Badge 
        className={`${styles.bgClass} ${styles.textClass} ${styles.borderClass} ${sizeClasses[size]} font-bold ${className}`}
      >
        <Zap className={`${iconSize[size]} fill-current`} />
        {showLabel && (
          <>
            <span>Performance Surge</span>
            <span className="font-mono">+{delta.delta.toFixed(0)}%</span>
          </>
        )}
        {!showLabel && <span className="font-mono">+{delta.delta.toFixed(0)}%</span>}
      </Badge>
    );
  }

  if (delta.isSlump) {
    return (
      <Badge 
        className={`${styles.bgClass} ${styles.textClass} ${styles.borderClass} ${sizeClasses[size]} font-bold ${className}`}
      >
        <TrendingDown className={iconSize[size]} />
        {showLabel && (
          <>
            <span>Slump</span>
            <span className="font-mono">{delta.delta.toFixed(0)}%</span>
          </>
        )}
        {!showLabel && <span className="font-mono">{delta.delta.toFixed(0)}%</span>}
      </Badge>
    );
  }

  return null;
}

/**
 * Compact delta indicator for inline use
 */
export function DeltaIndicator({
  delta,
  className = "",
}: {
  delta: DeltaResult | null;
  className?: string;
}) {
  if (!delta) return null;

  const isPositive = delta.delta >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  
  let colorClass = "text-muted-foreground";
  if (delta.isSurge) {
    colorClass = "text-emerald-400";
  } else if (delta.isSlump) {
    colorClass = "text-red-400";
  } else if (delta.delta > 5) {
    colorClass = "text-emerald-400/70";
  } else if (delta.delta < -5) {
    colorClass = "text-red-400/70";
  }

  return (
    <div className={`flex items-center gap-1 ${colorClass} ${className}`}>
      <Icon className="w-3 h-3" />
      <span className="text-xs font-mono">
        {isPositive ? "+" : ""}{delta.delta.toFixed(1)}%
      </span>
    </div>
  );
}
