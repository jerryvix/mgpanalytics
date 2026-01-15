import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardContent } from "@/components/DashboardContent";
import { User } from "@supabase/supabase-js";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { role, isAdmin, loading: roleLoading } = useUserRole(user);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session) {
          navigate("/");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/");
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Redirect non-admins trying to access /dashboard/admin
  useEffect(() => {
    if (!roleLoading && location.pathname === "/dashboard/admin" && !isAdmin) {
      toast.error("You don't have access to the Admin Panel");
      navigate("/dashboard");
    }
  }, [location.pathname, isAdmin, roleLoading, navigate]);

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-terminal-green glow-green animate-pulse-glow font-mono">
          LOADING TERMINAL...
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar user={user} isAdmin={isAdmin} />
        <main className="flex-1 overflow-auto">
          <DashboardContent isAdmin={isAdmin} />
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
