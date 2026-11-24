import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SPLITS_SPORTS } from "@/lib/marketPulse";
import type { MarketNoteRow } from "@/lib/marketNotes";

/** Notes for games that have not been over for long, shared by every splits surface. */
export function useMarketNotes(sport: string) {
  return useQuery({
    queryKey: ["market-notes", sport],
    enabled: SPLITS_SPORTS.has(sport),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MarketNoteRow[]> => {
      const since = new Date(Date.now() - 8 * 3600_000).toISOString();
      // `market_notes` is newer than the generated Supabase types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("market_notes")
        .select("id, sport, away_name, home_name, credit, body, url, starts_at")
        .eq("sport", sport)
        .gte("starts_at", since)
        .order("posted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MarketNoteRow[];
    },
  });
}
