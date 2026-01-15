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
  PenLine
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface AppSidebarProps {
  user: User;
  isAdmin: boolean;
  isPreviewingAsUser?: boolean;
  onTogglePreview?: () => void;
}

// Primary navigation - New Conversation starts fresh chat
const primaryMenuItem = {
  title: "New Conversation ✏️",
  url: "/dashboard",
  icon: PenLine,
};

// Sports slates - secondary navigation
const sportsMenuItems = [
  { title: "NFL 🏈", url: "/dashboard/nfl" },
  { title: "NBA 🏀", url: "/dashboard/nba" },
  { title: "MLB ⚾", url: "/dashboard/mlb" },
  { title: "NCAAF 🏈", url: "/dashboard/ncaaf" },
  { title: "NCAAB 🏀", url: "/dashboard/ncaab" },
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
        {/* Primary Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink 
                    to={primaryMenuItem.url} 
                    end
                    className="flex items-center gap-3 px-3 py-2 rounded text-terminal-green hover:bg-terminal-green/10 transition-colors font-medium"
                    activeClassName="bg-terminal-green/20 text-terminal-green"
                  >
                    <primaryMenuItem.icon className="w-4 h-4" />
                    {!collapsed && <span className="text-sm">{primaryMenuItem.title}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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
