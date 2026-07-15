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
  UserCircle,
  PenLine,
  MessageSquare,
  Trash2,
  Newspaper,
  Users,
  Home
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
      { title: "Futures", url: "/dashboard/ncaaf/futures" },
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
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    conversations, 
    conversationsLoading, 
    activeConversationId,
    startNewConversation,
    loadConversation,
    refreshConversations 
  } = useChat();
  
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
        <div className="flex items-center gap-3">
          <SidebarTrigger className="text-sidebar-foreground hover:text-terminal-green hover:bg-sidebar-accent" />
          {!collapsed && (
            <Link to="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
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
                        onClick={() => navigate("/dashboard")}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded transition-colors font-medium ${
                          location.pathname === "/dashboard"
                            ? "bg-terminal-green/15 text-terminal-green"
                            : "text-sidebar-foreground hover:bg-terminal-green/10 hover:text-terminal-green"
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
                      className="p-1 text-sidebar-foreground/40 hover:text-destructive transition-colors"
                      title="Clear all conversations"
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
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-left ${
                              activeConversationId === conv.id ? "bg-sidebar-accent text-terminal-green" : ""
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

        {/* Sports */}
        <SidebarGroup className="mt-1" data-coach="sports-nav">
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest px-2 mb-1">
              Sports
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {sportsMenuItems.map((item) => (
                <div key={item.title}>
                  <SidebarMenuItem>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            className="flex items-center gap-3 px-3 py-1.5 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                            activeClassName="bg-sidebar-accent text-terminal-green"
                          >
                            <img src={item.logo} alt={item.title} className="w-4 h-4 object-contain shrink-0" />
                            {!collapsed && <span className="text-sm">{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {collapsed && (
                        <TooltipContent side="right">{item.title}</TooltipContent>
                      )}
                    </Tooltip>
                  </SidebarMenuItem>
                  {/* Sub-items for sports with players */}
                  {!collapsed && item.subItems && (
                    <div className="ml-8 space-y-0.5 mt-0.5">
                      {item.subItems.map((sub) => (
                        <SidebarMenuItem key={sub.url}>
                          <SidebarMenuButton asChild>
                            <NavLink 
                              to={sub.url} 
                              className="flex items-center gap-2 px-3 py-1.5 rounded text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                              activeClassName="bg-sidebar-accent/50 text-terminal-green"
                            >
                              <span>{sub.title}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Community */}
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
                          className="flex items-center gap-3 px-3 py-1.5 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                          activeClassName="bg-sidebar-accent text-terminal-green"
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
                        className={`flex items-center gap-3 px-3 py-1.5 rounded transition-colors w-full cursor-pointer relative z-10 ${
                          location.pathname === "/dashboard/admin" 
                            ? "bg-sidebar-accent text-terminal-green" 
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
        {!collapsed && (
          <div className="mb-1 text-[10px] text-sidebar-foreground/60 font-mono truncate">
            {user.email}
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size={collapsed ? "icon" : "sm"}
              onClick={() => navigate("/dashboard/profile")}
              className={`w-full justify-start ${
                location.pathname === "/dashboard/profile"
                  ? "text-terminal-green bg-sidebar-accent"
                  : "text-sidebar-foreground hover:text-terminal-green hover:bg-sidebar-accent"
              }`}
            >
              <UserCircle className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="ml-2">Profile</span>}
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">Profile</TooltipContent>
          )}
        </Tooltip>

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
              className="w-full text-sidebar-foreground hover:text-destructive hover:bg-destructive/10 justify-start"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="ml-2">Logout</span>}
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">Logout</TooltipContent>
          )}
        </Tooltip>
      </SidebarFooter>
    </Sidebar>
  );
}