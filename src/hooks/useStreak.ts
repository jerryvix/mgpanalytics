import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StreakRow {
  current_streak: number;
  longest_streak: number;
  total_visits: number;
  last_visit_date: string | null;
}

// Records today's visit and returns the updated streak. Idempotent per day —
// the DB function no-ops if already counted today. Called once per session.
export function useStreak() {
  return useQuery<StreakRow | null>({
    queryKey: ["user-streak"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase.rpc("record_daily_visit");
      if (error) {
        console.error("record_daily_visit failed:", error.message);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return (row as StreakRow) ?? null;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
