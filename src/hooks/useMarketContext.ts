import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MarketContextRow {
  sport: string;
  gameCount: number;
  week: number | null;
}

const SPORT_TABLE: Record<string, string> = {
  NFL: "games",
  NBA: "nba_games",
  NCAAB: "ncaab_games",
  NCAAF: "ncaaf_games",
  MLB: "mlb_games",
};

// Real, lightweight "what is the Analyst currently looking at" summary - a
// count of upcoming games per active sport over the next 7 days, plus the
// real NFL week number when available. No fabricated season-phase labels.
async function loadMarketContext(sports: string[]): Promise<MarketContextRow[]> {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const rows = await Promise.all(
    sports.map(async (sport) => {
      const table = SPORT_TABLE[sport];
      if (!table) return null;

      let query = supabase
        .from(table as "games")
        .select(sport === "NFL" ? "id, week" : "id", { count: "exact" })
        .not("status", "ilike", "%final%")
        .gte("date", now.toISOString())
        .lte("date", in7Days.toISOString());

      const { data, count } = await query;
      const week = sport === "NFL" ? (data?.[0] as { week?: number | null } | undefined)?.week ?? null : null;

      return { sport, gameCount: count ?? data?.length ?? 0, week } as MarketContextRow;
    })
  );

  return rows.filter((r): r is MarketContextRow => r !== null && r.gameCount > 0);
}

export function useMarketContext(sports: string[]) {
  return useQuery({
    queryKey: ["market-context", sports],
    queryFn: () => loadMarketContext(sports),
    enabled: sports.length > 0,
    refetchInterval: 10 * 60 * 1000,
  });
}
