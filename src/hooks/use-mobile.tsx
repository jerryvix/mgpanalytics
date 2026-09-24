import * as React from "react";
import { PHONE_MEDIA } from "@/lib/layoutMedia";

/**
 * True when the dashboard should use its phone chrome: narrow screens, and
 * touch screens too short for the desktop layout (phones in landscape).
 * Mirrors the phone: Tailwind variant; see src/lib/layoutMedia.ts.
 */
export function useIsMobile() {
  // Read the media query on the first render: starting from "not mobile"
  // made phones paint one frame of the desktop sidebar rail before the
  // effect ran.
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(() =>
    typeof window === "undefined" ? undefined : window.matchMedia(PHONE_MEDIA).matches,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(PHONE_MEDIA);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
