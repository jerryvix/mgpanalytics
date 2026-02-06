import { useLocation, useNavigate } from "react-router-dom";
import { Home, Trophy, MessageCircle, Users, Menu } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: typeof Home;
  action: "navigate" | "chat";
  path?: string;
  matchPaths?: string[];
}

const navItems: NavItem[] = [
  {
    label: "Home",
    icon: Home,
    action: "navigate",
    path: "/dashboard",
    matchPaths: ["/dashboard"],
  },
  {
    label: "Sports",
    icon: Trophy,
    action: "navigate",
    path: "/dashboard/nfl",
    matchPaths: ["/dashboard/nfl", "/dashboard/nba", "/dashboard/ncaab", "/dashboard/ncaaf", "/dashboard/mlb"],
  },
  {
    label: "Chat",
    icon: MessageCircle,
    action: "chat",
  },
  {
    label: "Community",
    icon: Users,
    action: "navigate",
    path: "/community/feed",
    matchPaths: ["/community"],
  },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, toggleChat } = useChat();

  const isActive = (item: NavItem) => {
    if (item.action === "chat") return isOpen;
    if (!item.matchPaths) return false;
    return item.matchPaths.some((p) =>
      p === "/dashboard"
        ? location.pathname === "/dashboard" || location.pathname === "/dashboard/"
        : location.pathname.startsWith(p)
    );
  };

  const handleTap = (item: NavItem) => {
    if (item.action === "chat") {
      toggleChat();
    } else if (item.path) {
      // If chat is open on mobile, close it first
      if (isOpen) {
        toggleChat();
      }
      navigate(item.path);
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={item.label}
              onClick={() => handleTap(item)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                active
                  ? "text-terminal-green"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5", active && "drop-shadow-[0_0_4px_hsl(var(--terminal-green))]")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
