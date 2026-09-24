import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import {
  Activity,
  Settings,
  LogOut,
  Eye,
  EyeOff,
  PenLine,
  MessageSquare,
  Trash2,
  Newspaper,
  Users,
  Home,
  Zap,
  Search,
  TrendingUp,
  Target,
  BarChart3,
  Star,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useChat } from "@/contexts/ChatContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AppSidebarProps {
  user: User;
  isAdmin: boolean;
  isPreviewingAsUser?: boolean;
  onTogglePreview?: () => void;
}

// Market - cross-sport tools. Some of these are still being built; they route
// to a ComingSoon page rather than a dead link until the real feature ships.
const marketMenuItems = [
  { title: "Live Edges", url: "/dashboard/market/live-edges", icon: Zap },
  { title: "Game Finder", url: "/dashboard/market/game-finder", icon: Search },
  { title: "Line Movement", url: "/dashboard/market/line-movement", icon: TrendingUp },
  { title: "Player Props", url: "/dashboard/market/props", icon: Target },
  { title: "Trends", url: "/dashboard/market/trends", icon: BarChart3 },
];

// Sports slates - secondary navigation with logos
const sportsMenuItems = [
  { 
    title: "NFL", 
    url: "/dashboard/nfl", 
    logo: "/logos/nfl.png",
    subItems: [
      { title: "Games", url: "/dashboard/nfl" },
      { title: "Players", url: "/dashboard/nfl/players" },
      { title: "Trending Bets", url: "/dashboard/nfl/trending" },
    ]
  },
  { 
    title: "NBA", 
    url: "/dashboard/nba", 
    logo: "/logos/nba.png",
    subItems: [
      { title: "Games", url: "/dashboard/nba" },
      { title: "Players", url: "/dashboard/nba/players" },
    ]
  },
  {
    title: "NCAAB",
    url: "/dashboard/ncaab",
    logo: "/logos/ncaa.png",
    subItems: [
      { title: "Games", url: "/dashboard/ncaab" },
    ]
  },
  {
    title: "NCAAF",
    url: "/dashboard/ncaaf",
    logo: "/logos/ncaa.png",
    subItems: [
      { title: "Games", url: "/dashboard/ncaaf" },
      { title: "Trending Bets", url: "/dashboard/ncaaf/trending" },
    ]
  },
  {
    title: "MLB",
    url: "/dashboard/mlb",
    logo: "/logos/mlb.png",
    subItems: [
      { title: "Games", url: "/dashboard/mlb" },
      { title: "Players", url: "/dashboard/mlb/players" },
      { title: "Trending Bets", url: "/dashboard/mlb/trending" },
    ]
  },
];

// Community hidden per owner (Jul 2026) until the capper-feed strategy is
// decided - flip to true to restore the sidebar section.
const SHOW_COMMUNITY: boolean = false;

// Community menu items
const communityMenuItems = [
  { title: "Feed", url: "/dashboard/community/feed", icon: Newspaper },
  { title: "Cappers", url: "/dashboard/community/cappers", icon: Users },
];

const adminMenuItem = {
  title: "Admin Panel",
  url: "/dashboard/admin",
  icon: Settings,
};

export function AppSidebar({ user, isAdmin, isPreviewingAsUser, onTogglePreview }: AppSidebarProps) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  // The mobile sheet always shows the full sidebar; the icon rail is desktop-only
  const collapsed = !isMobile && state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();

  // Close the mobile sheet once a nav link lands somewhere (covers browser
  // back/forward while the sheet is open)
  useEffect(() => {
    setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);

  // Every nav tap in the sheet also closes it directly. The route effect above
  // misses taps on the screen you are already on (pathname never changes),
  // which used to leave the sheet stuck open. No-op on desktop.
  const closeMobileSheet = useCallback(() => setOpenMobile(false), [setOpenMobile]);
  const {
    conversations,
    conversationsLoading,
    activeConversationId,
    startNewConversation,
    loadConversation,
    refreshConversations,
    lastDataRefresh,
  } = useChat();

  // Sports sub-nav: NFL open by default, others collapsed - avoids a wall of
  // sub-links for sports the user isn't currently looking at.
  const [expandedSports, setExpandedSports] = useState<Record<string, boolean>>({ NFL: true });
  const toggleSportExpanded = (sport: string) => {
    setExpandedSports(prev => ({ ...prev, [sport]: !prev[sport] }));
  };

  // Use preview mode to show user view when testing
  const effectiveIsAdmin = isAdmin && !isPreviewingAsUser;

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Error signing out");
    } else {
      toast.success("LOGGED OUT", {
        description: "Session terminated",
      });
      navigate("/");
    }
  };

  const handleClearAllConversations = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      // Delete all conversations for this user (messages will be cascade deleted or handled by RLS)
      // First delete all messages for user's conversations
      const { data: userConvs } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_id", currentUser.id);

      if (userConvs && userConvs.length > 0) {
        const convIds = userConvs.map(c => c.id);
        
        // Delete messages first
        await supabase
          .from("messages")
          .delete()
          .in("conversation_id", convIds);

        // Then delete conversations
        await supabase
          .from("conversations")
          .delete()
          .eq("user_id", currentUser.id);
      }

      // Refresh the list
      refreshConversations();
      toast.success("All conversations cleared");
    } catch (error) {
      console.error("Error clearing conversations:", error);
      toast.error("Failed to clear conversations");
    }
  };

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
    <Sidebar 
      className="border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out"
      collapsible="icon"
    >
      <SidebarHeader className="border-b border-sidebar-border p-2">
        <div className={collapsed ? "flex flex-col items-center gap-2" : "flex items-center gap-3"}>
          {/* Desktop collapse toggle. The phone sheet swaps it for a plain
              close button on the right: "Collapse sidebar" means nothing in a
              sheet, and its focus tooltip popped over the logo on open. */}
          {!isMobile && (
            <SidebarTrigger className="text-sidebar-foreground hover:text-terminal-green hover:bg-sidebar-accent" />
          )}
          {collapsed ? (
            /* The rail keeps a tappable logo so home is always one click away,
               not hidden behind expanding the sidebar first */
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/dashboard"
                  className="w-7 h-7 rounded bg-primary/20 flex items-center justify-center hover:opacity-80 transition-opacity"
                >
                  <Activity className="w-3.5 h-3.5 text-terminal-green" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Home</TooltipContent>
            </Tooltip>
          ) : (
            <Link
              to="/dashboard"
              onClick={closeMobileSheet}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity phone:min-h-11 phone:pl-1"
            >
              <div className="w-7 h-7 rounded bg-primary/20 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-terminal-green" />
              </div>
              <div>
                <h2 className="text-base font-bold text-terminal-green glow-green tracking-wider">
                  MGP
                </h2>
                <p className="text-[9px] text-sidebar-foreground tracking-widest uppercase">
                  Analytics
                </p>
              </div>
            </Link>
          )}
          {isMobile && (
            <button
              type="button"
              onClick={closeMobileSheet}
              aria-label="Close menu"
              className="-mr-1 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sidebar-foreground select-none touch-manipulation transition-colors active:bg-sidebar-accent"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-1">
        {/* Home + New Conversation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton asChild>
                      <button
                        onClick={() => {
                          navigate("/dashboard");
                          closeMobileSheet();
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded transition-colors font-medium ${
                          location.pathname === "/dashboard"
                            ? "bg-terminal-blue/15 text-terminal-blue"
                            : "text-sidebar-foreground hover:bg-terminal-blue/10 hover:text-terminal-blue"
                        }`}
                      >
                        <Home className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="text-sm">Home</span>}
                      </button>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  {collapsed && <TooltipContent side="right">Home</TooltipContent>}
                </Tooltip>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton asChild>
                      <button 
                        onClick={() => {
                          navigate("/dashboard");
                          startNewConversation();
                          closeMobileSheet();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-1.5 rounded text-terminal-green hover:bg-terminal-green/10 transition-colors font-medium"
                      >
                        <PenLine className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="text-sm">New Conversation</span>}
                      </button>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right">New Conversation</TooltipContent>
                  )}
                </Tooltip>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Chat History */}
        {!collapsed && (
          <SidebarGroup className="mt-1">
            <div className="flex items-center justify-between px-2 mb-1">
              <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest p-0">
                Recent Chats
              </SidebarGroupLabel>
              {conversations.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="p-1 text-sidebar-foreground/40 hover:text-destructive transition-colors phone:-mr-2 phone:flex phone:h-11 phone:w-11 phone:items-center phone:justify-center phone:p-0"
                      title="Clear all conversations"
                      aria-label="Clear all conversations"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-foreground">Clear all conversations?</AlertDialogTitle>
                      <AlertDialogDescription className="text-muted-foreground">
                        This will permanently delete all your chat history. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-muted text-foreground hover:bg-muted/80">Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleClearAllConversations}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Clear
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <SidebarGroupContent>
                <SidebarMenu>
                  {conversationsLoading ? (
                    <div className="px-3 py-2 text-xs text-sidebar-foreground/50">Loading...</div>
                  ) : conversations.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-sidebar-foreground/50">No conversations yet</div>
                  ) : (
                    conversations.slice(0, 3).map((conv) => (
                      <SidebarMenuItem key={conv.id}>
                        <SidebarMenuButton asChild>
                          <button
                            onClick={() => {
                              navigate("/dashboard");
                              loadConversation(conv.id);
                              closeMobileSheet();
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-left ${
                              activeConversationId === conv.id ? "bg-sidebar-accent text-terminal-blue" : ""
                            }`}
                          >
                            <MessageSquare className="w-3 h-3 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs truncate">{conv.title}</p>
                              <p className="text-[10px] text-sidebar-foreground/50">{formatDate(conv.updated_at)}</p>
                            </div>
                          </button>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))
                  )}
                </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Market - cross-sport tools */}
        <SidebarGroup className="mt-1">
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest px-2 mb-1">
              Market
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {marketMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          onClick={closeMobileSheet}
                          className="flex items-center gap-3 px-3 py-1.5 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                          activeClassName="bg-sidebar-accent text-terminal-blue"
                        >
                          <item.icon className="w-4 h-4 shrink-0" />
                          {!collapsed && <span className="text-sm">{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right">{item.title}</TooltipContent>
                    )}
                  </Tooltip>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Sports */}
        <SidebarGroup className="mt-1" data-coach="sports-nav">
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest px-2 mb-1">
              Sports
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {sportsMenuItems.map((item) => {
                const isExpanded = !!expandedSports[item.title];
                return (
                <div key={item.title}>
                  <SidebarMenuItem>
                    {/* Phones: the link fills the whole 44px row (no dead
                        padding around it) and the chevron is its own 44px
                        target. Touch screens skip the row/chevron hover
                        styles: iOS keeps :hover on the last tapped element,
                        so expanding a sport left its row looking selected.
                        Desktop layout and hover are unchanged. */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild>
                          <div className="flex items-center gap-1 phone:p-0 [@media(hover:none)]:hover:bg-transparent">
                            <NavLink
                              to={item.url}
                              onClick={closeMobileSheet}
                              className="flex-1 flex items-center gap-3 px-3 py-1.5 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors phone:self-stretch"
                              activeClassName="bg-sidebar-accent text-terminal-blue"
                            >
                              <img src={item.logo} alt={item.title} className="w-4 h-4 object-contain shrink-0" />
                              {!collapsed && <span className="text-sm">{item.title}</span>}
                            </NavLink>
                            {!collapsed && item.subItems && (
                              <button
                                onClick={() => toggleSportExpanded(item.title)}
                                className="p-1 mr-1 text-sidebar-foreground/50 hover:text-sidebar-foreground shrink-0 phone:mr-0 phone:flex phone:h-11 phone:w-11 phone:items-center phone:justify-center phone:p-0 [@media(hover:none)]:hover:text-sidebar-foreground/50"
                                aria-label={isExpanded ? `Collapse ${item.title}` : `Expand ${item.title}`}
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {collapsed && (
                        <TooltipContent side="right">{item.title}</TooltipContent>
                      )}
                    </Tooltip>
                  </SidebarMenuItem>
                  {/* Sub-items for sports with players - NFL open by default, others collapsed */}
                  {!collapsed && item.subItems && isExpanded && (
                    <div className="ml-8 space-y-0.5 mt-0.5">
                      {item.subItems.map((sub) => (
                        <SidebarMenuItem key={sub.url}>
                          <SidebarMenuButton asChild>
                            <NavLink
                              to={sub.url}
                              onClick={closeMobileSheet}
                              className="flex items-center gap-2 px-3 py-1.5 rounded text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                              activeClassName="bg-sidebar-accent/50 text-terminal-blue"
                            >
                              <span>{sub.title}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Community */}
        {/* Community hidden per owner (Jul 2026) until the capper-feed strategy
            is decided - routes still work; restore via SHOW_COMMUNITY. */}
        {SHOW_COMMUNITY && (
          <SidebarGroup className="mt-1">
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest px-2 mb-1">
                Community
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {communityMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            onClick={closeMobileSheet}
                            className="flex items-center gap-3 px-3 py-1.5 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                            activeClassName="bg-sidebar-accent text-terminal-blue"
                          >
                            <item.icon className="w-4 h-4 shrink-0" />
                            {!collapsed && <span className="text-sm">{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {collapsed && (
                        <TooltipContent side="right">{item.title}</TooltipContent>
                      )}
                    </Tooltip>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Admin - hidden when previewing as user */}
        {isAdmin && !isPreviewingAsUser && (
          <SidebarGroup className="mt-1">
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest px-2 mb-1">
                Admin
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        to="/dashboard/admin"
                        onClick={closeMobileSheet}
                        className={`flex items-center gap-3 px-3 py-1.5 rounded transition-colors w-full cursor-pointer relative z-10 phone:min-h-11 ${
                          location.pathname === "/dashboard/admin"
                            ? "bg-sidebar-accent text-terminal-blue"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                      >
                        <Settings className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="text-sm">Admin Panel</span>}
                      </Link>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right">Admin Panel</TooltipContent>
                    )}
                  </Tooltip>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        {/* My Watchlist / Saved Chats / Settings */}
        <SidebarMenu>
          {[
            { title: "My Watchlist", url: "/dashboard/watchlist", icon: Star },
            { title: "Saved Chats", url: "/dashboard/chats", icon: MessageSquare },
            { title: "Settings", url: "/dashboard/profile", icon: Settings },
          ].map((item) => (
            <SidebarMenuItem key={item.title}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      onClick={closeMobileSheet}
                      className="flex items-center gap-3 px-3 py-1.5 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-terminal-blue"
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </TooltipTrigger>
                {collapsed && <TooltipContent side="right">{item.title}</TooltipContent>}
              </Tooltip>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>

        {!collapsed && (
          <div className="mt-1 mb-1 text-[10px] text-sidebar-foreground/60 font-mono truncate px-1">
            {user.email}
          </div>
        )}

        {/* Admin Preview Toggle - only show for actual admins */}
        {isAdmin && !collapsed && onTogglePreview && (
          <div className="mb-1 flex items-center justify-between gap-2 p-1.5 rounded bg-sidebar-accent/50 border border-dashed border-terminal-green/30">
            <div className="flex items-center gap-2">
              {isPreviewingAsUser ? (
                <EyeOff className="w-3 h-3 text-terminal-green" />
              ) : (
                <Eye className="w-3 h-3 text-terminal-green" />
              )}
              <Label htmlFor="preview-mode" className="text-[10px] text-sidebar-foreground cursor-pointer">
                Preview as User
              </Label>
            </div>
            <Switch
              id="preview-mode"
              checked={isPreviewingAsUser}
              onCheckedChange={onTogglePreview}
              className="scale-75"
            />
          </div>
        )}
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size={collapsed ? "icon" : "sm"}
              onClick={handleLogout}
              className="w-full text-sidebar-foreground hover:text-destructive hover:bg-destructive/10 justify-start phone:h-11"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="ml-2">Logout</span>}
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">Logout</TooltipContent>
          )}
        </Tooltip>

        {/* Live Data status - real timestamp of the last successful data fetch */}
        {!collapsed && (
          <div className="mt-1.5 flex items-center gap-2 px-2 py-1.5 rounded bg-sidebar-accent/40">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-terminal-cyan opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-terminal-cyan" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-mono font-medium text-terminal-cyan leading-tight">Live Data</p>
              <p className="text-[9px] font-mono text-sidebar-foreground/50 leading-tight truncate">
                {lastDataRefresh
                  ? `Last updated ${lastDataRefresh.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : "Connecting..."}
              </p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}