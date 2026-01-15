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
  LayoutDashboard, 
  Settings, 
  LogOut,
  Trophy,
  Dribbble
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppSidebarProps {
  user: User;
  isAdmin: boolean;
}

const baseMenuItems = [
  {
    title: "NFL Slate",
    url: "/dashboard/nfl",
    icon: Trophy,
  },
  {
    title: "NBA Slate",
    url: "/dashboard/nba",
    icon: Dribbble,
  },
];

const adminMenuItem = {
  title: "Admin Panel",
  url: "/dashboard/admin",
  icon: Settings,
};

export function AppSidebar({ user, isAdmin }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();
  
  // Build menu items based on role
  const menuItems = isAdmin 
    ? [...baseMenuItems, adminMenuItem] 
    : baseMenuItems;

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
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest px-2 mb-2">
              Navigation
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink 
                    to="/dashboard" 
                    end 
                    className="flex items-center gap-3 px-3 py-2 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                    activeClassName="bg-sidebar-accent text-terminal-green"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    {!collapsed && <span className="text-sm">Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      className="flex items-center gap-3 px-3 py-2 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-terminal-green"
                    >
                      <item.icon className="w-4 h-4" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!collapsed && (
          <div className="mb-3 text-[10px] text-sidebar-foreground/60 font-mono truncate">
            {user.email}
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
