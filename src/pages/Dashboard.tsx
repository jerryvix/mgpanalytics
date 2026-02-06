import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardContent } from "@/components/DashboardContent";
import { ChatPanel } from "@/components/chatbot";
import { BottomNav } from "@/components/ui/BottomNav";
import { User } from "@supabase/supabase-js";
import { useUserRole } from "@/hooks/useUserRole";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPreviewingAsUser, setIsPreviewingAsUser] = useState(false);
  const { role, isAdmin, loading: roleLoading } = useUserRole(user);
  const isMobile = useIsMobile();

  const handleTogglePreview = useCallback(() => {
    setIsPreviewingAsUser(prev => {
      const newValue = !prev;
      if (newValue) {
        toast.info("Preview Mode ON", { description: "Viewing as regular user" });
        // If on admin page, redirect away
        if (location.pathname === "/dashboard/admin") {
          navigate("/dashboard");
        }
      } else {
        toast.info("Preview Mode OFF", { description: "Back to admin view" });
      }
      return newValue;
    });
  }, [location.pathname, navigate]);

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

  // Compute effective admin status (real admin AND not previewing)
  const effectiveIsAdmin = isAdmin && !isPreviewingAsUser;

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full bg-background overflow-hidden">
        {/* Sidebar hidden on mobile — BottomNav replaces it */}
        {!isMobile && (
          <AppSidebar
            user={user}
            isAdmin={isAdmin}
            isPreviewingAsUser={isPreviewingAsUser}
            onTogglePreview={handleTogglePreview}
          />
        )}
        <main className="flex-1 overflow-auto">
          <DashboardContent isAdmin={effectiveIsAdmin} />
        </main>
        {/* ChatPanel: docked on desktop, full-screen overlay on mobile */}
        <ChatPanel />
        {/* Bottom nav replaces sidebar on mobile */}
        {isMobile && <BottomNav />}
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
