import { useLocation, useNavigate } from "react-router-dom";
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
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/contexts/ChatContext";

interface AppSidebarProps {
  user: User;
  isAdmin: boolean;
  isPreviewingAsUser?: boolean;
  onTogglePreview?: () => void;
}

// Sports slates - secondary navigation with logos
const sportsMenuItems = [
  { title: "NFL", url: "/dashboard/nfl", logo: "/logos/nfl.png" },
  { title: "NBA", url: "/dashboard/nba", logo: "/logos/nba.png" },
  { title: "MLB", url: "/dashboard/mlb", logo: "/logos/mlb.png" },
  { title: "NCAAF", url: "/dashboard/ncaaf", logo: "/logos/ncaa.png" },
  { title: "NCAAB", url: "/dashboard/ncaab", logo: "/logos/ncaa.png" },
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
    loadConversation 
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
      className={`${collapsed ? "w-14" : "w-60"} border-r border-sidebar-border bg-sidebar transition-all duration-200`}
      collapsible="icon"
    >
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-terminal-green" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-lg font-bold text-terminal-green glow-green tracking-wider">
                MGP
              </h2>
              <p className="text-[10px] text-sidebar-foreground tracking-widest uppercase">
                Analytics
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        {/* New Conversation Button */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <button 
                    onClick={() => {
                      navigate("/dashboard");
                      startNewConversation();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded text-terminal-green hover:bg-terminal-green/10 transition-colors font-medium"
                  >
                    <PenLine className="w-4 h-4" />
                    {!collapsed && <span className="text-sm">New Conversation</span>}
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Chat History */}
        {!collapsed && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest px-2 mb-2">
              Recent Chats
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <ScrollArea className="max-h-40">
                <SidebarMenu>
                  {conversationsLoading ? (
                    <div className="px-3 py-2 text-xs text-sidebar-foreground/50">Loading...</div>
                  ) : conversations.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-sidebar-foreground/50">No conversations yet</div>
                  ) : (
                    conversations.slice(0, 10).map((conv) => (
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
              </ScrollArea>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Sports */}
        <SidebarGroup className="mt-4">
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest px-2 mb-2">
              Sports
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {sportsMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      className="flex items-center gap-3 px-3 py-2 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-terminal-green"
                    >
                      <img src={item.logo} alt={item.title} className="w-5 h-5 object-contain" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin */}
        {effectiveIsAdmin && (
          <SidebarGroup className="mt-4">
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest px-2 mb-2">
                Admin
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={adminMenuItem.url} 
                      className="flex items-center gap-3 px-3 py-2 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-terminal-green"
                    >
                      <adminMenuItem.icon className="w-4 h-4" />
                      {!collapsed && <span className="text-sm">{adminMenuItem.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!collapsed && (
          <div className="mb-3 text-[10px] text-sidebar-foreground/60 font-mono truncate">
            {user.email}
          </div>
        )}
        
        {/* Admin Preview Toggle - only show for actual admins */}
        {isAdmin && !collapsed && onTogglePreview && (
          <div className="mb-3 flex items-center justify-between gap-2 p-2 rounded bg-sidebar-accent/50 border border-dashed border-terminal-green/30">
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
        
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={handleLogout}
          className="w-full text-sidebar-foreground hover:text-destructive hover:bg-destructive/10 justify-start"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="ml-2">Logout</span>}
        </Button>
        <SidebarTrigger className="w-full mt-2" />
      </SidebarFooter>
    </Sidebar>
  );
}
