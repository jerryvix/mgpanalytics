import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface SportTab {
  label: string;
  path: string;
  logo: string;
  subTabs?: { label: string; path: string }[];
}

const sports: SportTab[] = [
  {
    label: "NFL",
    path: "/dashboard/nfl",
    logo: "/logos/nfl.png",
    subTabs: [
      { label: "Games", path: "/dashboard/nfl" },
      { label: "Players", path: "/dashboard/nfl/players" },
    ],
  },
  {
    label: "NBA",
    path: "/dashboard/nba",
    logo: "/logos/nba.png",
    subTabs: [
      { label: "Games", path: "/dashboard/nba" },
      { label: "Players", path: "/dashboard/nba/players" },
    ],
  },
  {
    label: "NCAAB",
    path: "/dashboard/ncaab",
    logo: "/logos/ncaa.png",
    subTabs: [
      { label: "Games", path: "/dashboard/ncaab" },
      { label: "Players", path: "/dashboard/ncaab/players" },
    ],
  },
];

export function MobileSportNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  // Find active sport based on current path
  const activeSport = sports.find((s) =>
    location.pathname.startsWith(s.path)
  );

  return (
    <div className="mb-4 space-y-2">
      {/* Sport tabs */}
      <div className="flex gap-1">
        {sports.map((sport) => {
          const isActive = activeSport?.label === sport.label;
          return (
            <button
              key={sport.label}
              onClick={() => navigate(sport.path)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                isActive
                  ? "bg-terminal-green/15 text-terminal-green border border-terminal-green/40"
                  : "bg-card/50 text-muted-foreground border border-border hover:text-foreground"
              )}
            >
              <img src={sport.logo} alt={sport.label} className="w-4 h-4 object-contain" />
              {sport.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tabs (Games / Players) */}
      {activeSport?.subTabs && (
        <div className="flex gap-1">
          {activeSport.subTabs.map((sub) => {
            const isActive = location.pathname === sub.path;
            return (
              <button
                key={sub.path}
                onClick={() => navigate(sub.path)}
                className={cn(
                  "px-3 py-1 rounded text-xs font-medium transition-colors",
                  isActive
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
