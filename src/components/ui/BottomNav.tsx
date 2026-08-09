import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Trophy, MessageCircle, UserCircle, Menu } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";
import { useOptionalSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: typeof Home;
  action: "navigate" | "chat" | "menu";
  path?: string;
  matchPaths?: string[];
}

const SPORTS_PATHS = ["/dashboard/nfl", "/dashboard/nba", "/dashboard/ncaab", "/dashboard/ncaaf", "/dashboard/mlb"];

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
    path: "/dashboard/nba",
    matchPaths: SPORTS_PATHS,
  },
  {
    label: "Chat",
    icon: MessageCircle,
    action: "chat",
  },
  // Community hidden per owner (Jul 2026) until the capper-feed strategy is
  // decided - routes still work, restore by uncommenting this entry.
  // {
  //   label: "Community",
  //   icon: Users,
  //   action: "navigate",
  //   path: "/dashboard/community/feed",
  //   matchPaths: ["/dashboard/community"],
  // },
  {
    label: "Profile",
    icon: UserCircle,
    action: "navigate",
    path: "/dashboard/profile",
    matchPaths: ["/dashboard/profile"],
  },
  // Opens the full sidebar (every sport, players, trending, community, admin)
  // as an off-canvas sheet - the mobile stand-in for the desktop left rail
  {
    label: "Menu",
    icon: Menu,
    action: "menu",
  },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, toggleChat } = useChat();
  const sidebar = useOptionalSidebar();
  // No sidebar on this page (no provider) - drop the Menu tab rather than crash
  const items = sidebar ? navItems : navItems.filter((i) => i.action !== "menu");
  // Remember the last sport page the user visited (default to MLB - the
  // sport most likely in season when someone first taps Sports)
  const lastSportPath = useRef("/dashboard/mlb");

  // Track current sport page
  const currentSportPath = SPORTS_PATHS.find((p) => location.pathname.startsWith(p));
  if (currentSportPath) {
    lastSportPath.current = currentSportPath;
  }

  const isActive = (item: NavItem) => {
    if (item.action === "chat") return isOpen;
    if (item.action === "menu") return !!sidebar?.openMobile;
    if (!item.matchPaths) return false;
    return item.matchPaths.some((p) =>
      p === "/dashboard"
        ? location.pathname === "/dashboard" || location.pathname === "/dashboard/"
        : location.pathname.startsWith(p)
    );
  };

  const handleTap = (item: NavItem) => {
    if (item.action === "menu") {
      if (isOpen) {
        toggleChat();
      }
      sidebar?.setOpenMobile(true);
    } else if (item.action === "chat") {
      toggleChat();
    } else {
      if (isOpen) {
        toggleChat();
      }
      // iOS convention: re-tapping the active tab scrolls its view to the top
      if (isActive(item)) {
        document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // For Sports tab, navigate to last visited sport
      if (item.label === "Sports") {
        navigate(lastSportPath.current);
      } else if (item.path) {
        navigate(item.path);
      }
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-4"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto max-w-md mb-2 rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-lg shadow-black/30">
        <div className="flex items-center justify-around h-14">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.label}
                data-coach={item.label === "Sports" ? "sports-nav" : undefined}
                onClick={() => handleTap(item)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full select-none",
                  "transition-[color,transform] duration-150 active:scale-90",
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
      </div>
    </nav>
  );
}
