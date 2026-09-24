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
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { OnboardingModal } from "@/components/onboarding";
import { GuidedWalkthrough } from "@/components/onboarding/GuidedWalkthrough";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

// TEMPORARY DEV-ONLY BYPASS: lets the dashboard render without a real Supabase
// session when VITE_DEV_BYPASS_AUTH=true. Revert before shipping real auth work.
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === "true";
const DEV_FAKE_USER = { id: "dev-preview-user", email: "preview@local.dev" } as User;

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPreviewingAsUser, setIsPreviewingAsUser] = useState(false);
  const { role, isAdmin, loading: roleLoading } = useUserRole(user);
  const { onboardingCompleted, loading: trialLoading } = useTrialStatus();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [walkthroughReady, setWalkthroughReady] = useState(false);
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

  // Deep links to /dashboard/* opened while logged out are stashed here so the
  // post-login landing can restore them instead of dropping users on home.
  const stashDeepLink = useCallback(() => {
    const path = window.location.pathname + window.location.search;
    if (path.startsWith("/dashboard/") && path !== "/dashboard/") {
      sessionStorage.setItem("mgp-post-login-redirect", path);
    }
  }, []);

  useEffect(() => {
    if (DEV_BYPASS_AUTH) {
      setUser(DEV_FAKE_USER);
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session) {
          stashDeepLink();
          navigate("/");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        stashDeepLink();
        navigate("/");
      } else {
        const stored = sessionStorage.getItem("mgp-post-login-redirect");
        if (stored && stored.startsWith("/dashboard")) {
          sessionStorage.removeItem("mgp-post-login-redirect");
          if (stored !== window.location.pathname + window.location.search) {
            navigate(stored);
          }
        }
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate, stashDeepLink]);

  // Show onboarding modal for users who haven't completed it - only on dashboard home
  const isOnDashboardHome = location.pathname === "/dashboard" || location.pathname === "/dashboard/";
  useEffect(() => {
    if (!trialLoading && !onboardingCompleted && user && isOnDashboardHome) {
      setShowOnboarding(true);
    } else if (onboardingCompleted || !isOnDashboardHome) {
      setShowOnboarding(false);
    }
  }, [trialLoading, onboardingCompleted, user, isOnDashboardHome]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    // Trigger walkthrough after a short delay
    setTimeout(() => setWalkthroughReady(true), 500);
  };

  // Redirect non-admins trying to access /dashboard/admin
  useEffect(() => {
    if (!roleLoading && location.pathname === "/dashboard/admin" && !isAdmin) {
      toast.error("You don't have access to the Admin Panel");
      navigate("/dashboard");
    }
  }, [location.pathname, isAdmin, roleLoading, navigate]);

  // Only the admin route has to wait for the role; every other page renders
  // as soon as auth resolves and picks up admin chrome when the role lands.
  if (loading || (roleLoading && location.pathname === "/dashboard/admin")) {
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
      {/* h-dvh (not h-screen): iOS Safari's collapsing toolbar makes 100vh
          taller than the visible area, which pushed the bottom nav half
          off-screen until the user scrolled */}
      <div className="h-dvh flex w-full bg-background overflow-hidden">
        {/* Always mounted: fixed rail on desktop, off-canvas sheet on mobile
            (opened from BottomNav's Menu tab). Do not gate this on isMobile -
            that leaves phones with no full navigation (see mobileNav test). */}
        <AppSidebar
          user={user}
          isAdmin={isAdmin}
          isPreviewingAsUser={isPreviewingAsUser}
          onTogglePreview={handleTogglePreview}
        />

        <main className="flex-1 overflow-auto overscroll-contain">
          <DashboardContent isAdmin={effectiveIsAdmin} />
        </main>
        {/* ChatPanel: docked on desktop, full-screen overlay on mobile */}
        <ChatPanel />
        {/* Bottom nav replaces sidebar on mobile */}
        {isMobile && <BottomNav />}
      </div>
      {/* Onboarding Modal - shown once for new users */}
      <OnboardingModal open={showOnboarding} onComplete={handleOnboardingComplete} />
      {/* Guided Walkthrough - triggered after onboarding completes */}
      {walkthroughReady && (
        <GuidedWalkthrough onComplete={() => setWalkthroughReady(false)} />
      )}
    </SidebarProvider>
  );
};

export default Dashboard;
