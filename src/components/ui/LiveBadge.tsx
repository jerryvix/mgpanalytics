import { Badge } from "@/components/ui/badge";

// Pulsing red LIVE badge with the in-game situation (clock/period or inning).
export function LiveBadge({ detail }: { detail?: string }) {
  return (
    <Badge className="bg-red-500/15 text-red-400 border-red-500/50 text-[10px] font-mono gap-1.5">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
      </span>
      LIVE{detail ? ` · ${detail}` : ""}
    </Badge>
  );
}
