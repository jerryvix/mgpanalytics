import { useLocation } from "react-router-dom";
import { Activity, ChevronDown, ChevronLeft, Menu } from "lucide-react";
import { useOptionalSidebar } from "@/components/ui/sidebar";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { mobileTitleFor } from "@/lib/dashboardNav";
import { cn } from "@/lib/utils";

// Phone navigation bar, iOS style: Back on the left, the section name in the
// middle, the sidebar toggle on the right. It is sticky inside the dashboard's
// scroll container, so both controls stay one tap away however far a page
// scrolls, and it pads itself below the status bar / Dynamic Island when MGP
// runs from the Home Screen. Desktop keeps its inline BackButton and rail.

// 44x44 targets (Apple HIG minimum) with press feedback only: hover styles
// would stick after a tap on iOS.
const barButton =
  "flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-foreground/90 select-none touch-manipulation transition-colors active:bg-foreground/10";

interface MobileTopBarProps {
  /** A pinned section nav (MobileSportNav) sits directly below: drop this
   *  bar's margin and hairline so the two read as one header. */
  subnav?: boolean;
  /** Set while the sport pills are collapsed: the title turns into a tap
   *  target (with a small chevron hint) that brings them back. */
  onRevealSubnav?: () => void;
}

export function MobileTopBar({ subnav = false, onRevealSubnav }: MobileTopBarProps) {
  const { pathname } = useLocation();
  const { isHome, goBack } = useBackNavigation();
  const sidebar = useOptionalSidebar();
  const title = mobileTitleFor(pathname);

  return (
    <header
      data-mobile-topbar
      className={cn(
        "sticky top-0 z-30 -mx-4 bg-background/85 pt-[var(--safe-top)] backdrop-blur-xl md:hidden",
        !subnav && "mb-3 border-b border-border/60"
      )}
    >
      <div className="relative flex h-[var(--mobile-topbar-h)] items-center justify-between px-1">
        {isHome ? (
          <div className="flex h-11 items-center gap-2 pl-3">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-primary/20">
              <Activity className="h-3.5 w-3.5 text-terminal-green" />
            </span>
            <span className="text-[15px] font-bold tracking-wider text-terminal-green">MGP</span>
          </div>
        ) : (
          <button type="button" onClick={goBack} aria-label="Go back" className={`${barButton} gap-0.5 pl-1.5 pr-3 text-[15px] font-medium`}>
            <ChevronLeft className="h-5 w-5" />
            Back
          </button>
        )}

        {title &&
          (onRevealSubnav ? (
            <button
              type="button"
              onClick={onRevealSubnav}
              aria-label={`${title}: show sports`}
              className="absolute inset-x-24 flex h-11 min-w-0 items-center justify-center gap-1 rounded-full text-[15px] font-semibold text-foreground select-none touch-manipulation transition-colors active:bg-foreground/10"
            >
              <span className="truncate">{title}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          ) : (
            <span className="pointer-events-none absolute inset-x-24 truncate text-center text-[15px] font-semibold text-foreground">
              {title}
            </span>
          ))}

        {sidebar && (
          <button
            type="button"
            onClick={() => sidebar.setOpenMobile(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={sidebar.openMobile}
            className={`${barButton} w-11`}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
      </div>
    </header>
  );
}
