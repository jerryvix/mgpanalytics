import { useQuery } from "@tanstack/react-query";
import { etDate } from "../../supabase/functions/_shared/mlb-statsapi";
import { loadProbableWindow } from "@/services/mlb/probablePitchers";

/**
 * Probable starters (plus season and last-3-start lines) for yesterday through
 * three days out. Probables are announced a day or two ahead and pitcher lines
 * move once per start, so a 15 minute stale time is plenty; keyed by the
 * Eastern date so the window rolls over at midnight.
 */
export function useMlbProbables(enabled = true) {
  return useQuery({
    queryKey: ["mlb-probables", etDate(new Date())],
    queryFn: () => loadProbableWindow(),
    enabled,
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
