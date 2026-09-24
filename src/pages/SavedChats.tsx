import { MessageSquare, ChevronRight } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";

export default function SavedChats() {
  const { conversations, conversationsLoading, loadConversation } = useChat();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return "Yesterday";
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-sm text-foreground uppercase tracking-widest font-bold">
        Saved Chats
      </h1>

      {conversationsLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-card border border-border rounded-lg px-4 py-3">
          No saved chats yet. Start a conversation with the MGP Analyst and it'll show up here.
        </p>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border overflow-hidden">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors group"
            >
              <MessageSquare className="w-4 h-4 text-terminal-purple shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{conv.title}</p>
                <p className="text-[11px] text-muted-foreground font-mono">{formatDate(conv.updated_at)}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
