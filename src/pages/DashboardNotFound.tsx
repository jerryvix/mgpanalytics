import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, Compass, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackNavigation } from "@/hooks/useBackNavigation";

// Any /dashboard/* path without a route (a typo, a stale bookmark, a removed
// page like the old NCAAB players list, or a bare prefix like
// /dashboard/market) lands here instead of on a blank screen. It renders
// inside the dashboard shell, so the sidebar, top bar and tab bar still work,
// and it offers both ways out: Back (history, or the nearest real parent on a
// cold link) and Home.
export default function DashboardNotFound() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { goBack } = useBackNavigation();

  return (
    <div className="flex flex-col items-center px-2 py-16 text-center">
      <Compass className="mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">This link may be out of date.</p>
      <p className="mt-2 max-w-full truncate font-mono text-xs text-muted-foreground/70">{pathname}</p>
      <div className="mt-6 flex gap-3">
        <Button onClick={goBack} className="h-11 md:h-10">
          <ChevronLeft />
          Back
        </Button>
        <Button variant="outline" onClick={() => navigate("/dashboard")} className="h-11 md:h-10">
          <Home />
          Home
        </Button>
      </div>
    </div>
  );
}
