import { ChevronLeft } from "lucide-react";
import { useBackNavigation } from "@/hooks/useBackNavigation";

// One back affordance for every dashboard screen. Desktop renders this inline
// button at the top of the content; phones get the same behavior from the
// pinned MobileTopBar, so Back never scrolls out of reach there. The fallback
// rules (history pop vs. parent route) live in useBackNavigation.

export function BackButton() {
  const { isHome, goBack } = useBackNavigation();

  if (isHome) {
    return null;
  }

  // Desktop only (hidden below md): the classes are otherwise unchanged, so
  // the desktop button renders exactly as before.
  return (
    <button
      onClick={goBack}
      aria-label="Go back"
      className="group mb-2 -ml-1.5 hidden min-h-[44px] items-center gap-0.5 rounded-full pl-1 pr-3 text-[13px] font-medium text-muted-foreground transition-colors select-none hover:bg-foreground/5 hover:text-foreground active:bg-foreground/10 desk:mb-3 desk:inline-flex desk:min-h-0 desk:py-1 desk:pr-2.5 desk:text-xs"
    >
      <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
      Back
    </button>
  );
}
