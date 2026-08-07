import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

// One back affordance for every dashboard screen, desktop and mobile. Pages
// used to hide their own back links behind md: breakpoints on the assumption
// the bottom nav covered it, which left phone users stranded on detail pages.

/**
 * Where "back" lands when there is no in-app history to pop (deep link,
 * refresh, or a fresh tab): one segment up, floored at the dashboard home.
 */
function parentPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  const parent = trimmed.slice(0, trimmed.lastIndexOf("/"));
  return parent.startsWith("/dashboard") ? parent : "/dashboard";
}

export function BackButton() {
  const location = useLocation();
  const navigate = useNavigate();

  // Home is the root of the app; there is nothing above it.
  if (location.pathname === "/dashboard" || location.pathname === "/dashboard/") {
    return null;
  }

  const handleBack = () => {
    // React Router stamps its own index onto history state. Anything above 0
    // means we arrived from another in-app screen, so popping returns the
    // user where they actually came from instead of a guessed parent.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      navigate(-1);
    } else {
      navigate(parentPath(location.pathname));
    }
  };

  // Roomier tap target on phones, tighter on desktop where a cursor is precise.
  return (
    <button
      onClick={handleBack}
      aria-label="Go back"
      className="group mb-2 -ml-1.5 inline-flex items-center gap-0.5 rounded-full py-2 pl-1 pr-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground active:bg-foreground/10 md:mb-3 md:py-1"
    >
      <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
      Back
    </button>
  );
}
