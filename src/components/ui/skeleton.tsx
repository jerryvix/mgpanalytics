import { cn } from "@/lib/utils";

// Shimmer sweep over the muted base — reads as "data incoming" rather than a
// static pulse. Falls back to a still block under prefers-reduced-motion.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted", className)} {...props}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer motion-reduce:animate-none bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
    </div>
  );
}

export { Skeleton };
