import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Scrolls the dashboard's content (<main>, the scroll container) back to the
 * top: what re-tapping the tab for the screen you're on does (iOS
 * convention). Instant with reduced motion.
 */
export function scrollDashboardToTop() {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.querySelector("main")?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}

/**
 * For nav controls that can point at the screen already showing (a sport
 * pill, a section tab, a sidebar item). Going "there" again must not push a
 * duplicate history entry: each one made the next Back tap seem to do
 * nothing. It scrolls back to the top instead, like re-tapping a tab.
 */
export function useNavigateOrScrollTop() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback(
    (to: string) => {
      if (to === pathname) scrollDashboardToTop();
      else navigate(to);
    },
    [navigate, pathname],
  );
}
