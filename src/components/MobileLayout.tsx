import { ReactNode } from "react";
import { BottomNav } from "@/components/ui/BottomNav";
import { useIsMobile } from "@/hooks/use-mobile";

export function MobileLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();

  return (
    <>
      <div className={isMobile ? "pb-20" : ""}>{children}</div>
      {isMobile && <BottomNav />}
    </>
  );
}
