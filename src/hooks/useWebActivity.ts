import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { recordWebActivity } from "@/lib/activity";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Counts a signed-in website visit once per US Eastern day (app_activity, source 'web'),
 * on sign-in and again when the tab comes back after midnight. Errors are ignored.
 */
export function useWebActivity(user: User | null) {
  const id = user?.id;
  const anonymous = user?.is_anonymous ?? false;
  useEffect(() => {
    if (!id) return;
    const record = () =>
      void recordWebActivity({ id, is_anonymous: anonymous }, {
        upsert: (row) =>
          supabase.from("app_activity").upsert(row, { onConflict: "user_id,day,source", ignoreDuplicates: true }),
        storage: storage(),
      });
    record();
    const onVisible = () => {
      if (document.visibilityState === "visible") record();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [id, anonymous]);
}
