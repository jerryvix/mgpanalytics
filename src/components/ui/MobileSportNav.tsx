import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface SportTab {
  label: string;
  path: string;
  logo: string;
  subTabs?: { label: string; path: string }[];
}

// Must mirror the desktop sidebar: every sport, every live route.
const sports: SportTab[] = [
  {
    label: "NFL",
    path: "/dashboard/nfl",
    logo: "/logos/nfl.png",
    subTabs: [
      { label: "Games", path: "/dashboard/nfl" },
      { label: "Players", path: "/dashboard/nfl/players" },
      { label: "Trending", path: "/dashboard/nfl/trending" },
    ],
  },
  {
    label: "MLB",
    path: "/dashboard/mlb",
    logo: "/logos/mlb.png",
    subTabs: [
      { label: "Games", path: "/dashboard/mlb" },
      { label: "Players", path: "/dashboard/mlb/players" },
      { label: "Trending", path: "/dashboard/mlb/trending" },
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
    label: "NCAAF",
    path: "/dashboard/ncaaf",
    logo: "/logos/ncaa.png",
    subTabs: [
      { label: "Games", path: "/dashboard/ncaaf" },
      { label: "Trending", path: "/dashboard/ncaaf/trending" },
    ],
  },
  {
    label: "NCAAB",
    path: "/dashboard/ncaab",
    logo: "/logos/ncaa.png",
    subTabs: [{ label: "Games", path: "/dashboard/ncaab" }],
  },
];

export function MobileSportNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const rowRef = useRef<HTMLDivElement>(null);
  const activePillRef = useRef<HTMLButtonElement>(null);

  // Find active sport based on current path
  const activeSport = sports.find((s) =>
    location.pathname.startsWith(s.path)
  );

  // The row scrolls sideways, so a sport near the end (NCAAB) would start
  // out of view: bring the active pill into the row when the sport changes.
  // Scrolls only the row itself, never the page.
  useEffect(() => {
    const row = rowRef.current;
    const pill = activePillRef.current;
    if (!row || !pill) return;
    const r = row.getBoundingClientRect();
    const p = pill.getBoundingClientRect();
    if (p.left < r.left || p.right > r.right) {
      row.scrollLeft += p.left - r.left - 16;
    }
  }, [activeSport?.label, isMobile]);

  if (!isMobile) return null;

  // Pinned directly under MobileTopBar (same translucent background, one
  // hairline under both), so switching sport or section is one tap from
  // anywhere on a long page. Its height is --mobile-sportnav-h, which the
  // dashboard scroller adds to its scroll padding so nothing scrolls into
  // view hidden underneath it.
  return (
    <div
      data-sport-nav
      className="sticky top-[calc(var(--safe-top)+var(--mobile-topbar-h))] z-20 -mx-4 mb-4 space-y-1.5 border-b border-border/60 bg-background/85 px-4 pb-2 backdrop-blur-xl"
    >
      {/* Sport tabs - five sports don't fit a phone width, so the row scrolls.
          Hidden scrollbar + contained overscroll keeps it feeling native.
          Each button is a 44px-tall tap target around a 40px pill, so the
          target meets Apple's minimum while the pill looks the same. */}
      <div ref={rowRef} className="flex gap-1.5 overflow-x-auto scrollbar-hide overscroll-x-contain -mx-4 px-4">
        {sports.map((sport) => {
          const isActive = activeSport?.label === sport.label;
          return (
            <button
              key={sport.label}
              ref={isActive ? activePillRef : undefined}
              onClick={() => navigate(sport.path)}
              aria-current={isActive ? "page" : undefined}
              className="group flex h-11 shrink-0 items-center select-none touch-manipulation"
            >
              <span
                className={cn(
                  "flex h-10 items-center gap-1.5 px-3.5 rounded-full text-[13px] font-medium",
                  "transition-[color,background-color,transform] duration-150 group-active:scale-[0.96]",
                  isActive
                    ? "bg-terminal-green/15 text-terminal-green border border-terminal-green/40"
                    : "bg-card/50 text-muted-foreground border border-border group-active:text-foreground"
                )}
              >
                <img src={sport.logo} alt="" className="w-4 h-4 object-contain pointer-events-none" />
                {sport.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sub-tabs (Games / Players / Trending) as an iOS-style segmented control.
          Segments stay 34px tall; an invisible ::after extends each tap
          target to 44px above and below without overlapping its neighbors.
          Block-level (flex w-fit) so no inline line box pads its height. */}
      {activeSport?.subTabs && (
        <div className="flex w-fit rounded-lg bg-card/70 border border-border p-0.5 gap-0.5">
          {activeSport.subTabs.map((sub) => {
            const isActive = location.pathname === sub.path;
            return (
              <button
                key={sub.path}
                onClick={() => navigate(sub.path)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative px-3.5 min-h-[34px] rounded-md text-xs font-medium select-none touch-manipulation",
                  "after:absolute after:inset-x-0 after:-top-[5px] after:-bottom-[5px]",
                  "transition-[color,background-color] duration-150",
                  isActive
                    ? "bg-foreground/10 text-foreground shadow-sm"
                    : "text-muted-foreground active:text-foreground"
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
