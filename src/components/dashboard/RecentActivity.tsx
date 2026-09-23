import { ChevronRight } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";

const SPORT_KEYWORDS: Record<string, string> = {
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  ncaab: "NCAAB",
  ncaaf: "NCAAF",
};

// Lightweight, honest inference from the query text itself - no fabricated
// classification model behind it.
function inferSport(title: string): string {
  const lower = title.toLowerCase();
  for (const [needle, label] of Object.entries(SPORT_KEYWORDS)) {
    if (lower.includes(needle)) return label;
  }
  return "General";
}

function inferType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("line") || lower.includes("move")) return "Line movement";
  if (lower.includes("prop")) return "Player props";
  if (lower.includes("favorite") || lower.includes("spread") || lower.includes("value")) return "Market analysis";
  if (lower.includes("slate") || lower.includes("tonight") || lower.includes("today")) return "Slate overview";
  return "General question";
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function RecentActivity() {
  const { conversations, loadConversation } = useChat();

  if (conversations.length === 0) return null;

  return (
    <section>
      <h2 className="font-mono text-[11px] text-foreground uppercase tracking-widest font-bold mb-3">
        Recent Activity
      </h2>
      <div className="bg-card border border-border rounded-lg divide-y divide-border overflow-hidden">
        {conversations.slice(0, 6).map((conv) => (
          <button
            key={conv.id}
            onClick={() => loadConversation(conv.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors group"
          >
            <span className="font-mono text-[11px] text-muted-foreground w-14 shrink-0">
              {formatTime(conv.updated_at)}
            </span>
            <span className="text-sm text-foreground truncate flex-1 min-w-0">{conv.title}</span>
            <span className="font-mono text-[10px] text-terminal-blue shrink-0 hidden sm:inline">
              {inferSport(conv.title)}
            </span>
            <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
              {inferType(conv.title)}
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
          </button>
        ))}
      </div>
    </section>
  );
}
