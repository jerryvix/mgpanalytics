import { AlertTriangle } from "lucide-react";

interface EntertainmentDisclaimerProps {
  compact?: boolean;
}

export function EntertainmentDisclaimer({ compact = false }: EntertainmentDisclaimerProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-1 text-xs text-pink-400">
        <AlertTriangle className="h-3 w-3" />
        <span>Entertainment personality</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-pink-500/10 border border-pink-500/20 text-sm">
      <AlertTriangle className="h-4 w-4 text-pink-400 shrink-0" />
      <span className="text-pink-300">
        Entertainment personality - follow for vibes and content, not sharp picks
      </span>
    </div>
  );
}
