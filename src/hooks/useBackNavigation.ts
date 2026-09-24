import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isDashboardHome, parentPath } from "@/lib/dashboardNav";

/**
 * Shared Back behavior for the desktop BackButton and the phone MobileTopBar.
 * Pops in-app history when there is some; otherwise walks up to the parent
 * screen so a deep link never "backs" out of the app.
 */
export function useBackNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const goBack = useCallback(() => {
    // React Router stamps its own index onto history state. Anything above 0
    // means we arrived from another in-app screen, so popping returns the
    // user where they actually came from instead of a guessed parent. At 0
    // (opened directly) popping would leave the app, so walk up instead.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      navigate(-1);
    } else {
      navigate(parentPath(location.pathname));
    }
  }, [location.pathname, navigate]);

  // Home is the root of the app; there is nothing above it.
  return { isHome: isDashboardHome(location.pathname), goBack };
}
