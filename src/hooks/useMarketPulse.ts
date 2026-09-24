import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { latestSnapshots } from "@/lib/odds";
import {
  buildMarketPulse,
  SPLITS_SPORTS,
  type OddsRowLike,
  type OpenQuoteLike,
  type PulseMarket,
  type PulseMarketView,
} from "@/lib/marketPulse";

// One read of a game's market for Game Insights: Market Pulse renders it and
// Market Read's win probability uses the same moneyline, so the sheet never
// shows two numbers for one market.

export interface MarketPulseState {
  pulse: Record<PulseMarket, PulseMarketView | null> | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

interface HistoryRow {
  game_id: string;
  bookmaker: string;
  odds_type: string;
  team: string | null;
  opening_line: number | null;
  timestamp: string | null;
}

/**
 * DraftKings' open for a sport without stored lines (MLB): the LATEST
 * odds_history capture of each bet type and side. One book, never an average
 * across captures.
 */
export function historyOpens(rows: HistoryRow[], homeName?: string, awayName?: string): OpenQuoteLike[] {
  const out: OpenQuoteLike[] = [];
  for (const r of latestSnapshots(rows)) {
    const type = r.odds_type.toLowerCase();
    const market = type.includes("moneyline") ? "moneyline" : type.includes("total") ? "total" : type.includes("spread") ? "spread" : null;
    if (!market) continue;
    const side =
      market === "total"
        ? r.team === "Over" ? "over" : r.team === "Under" ? "under" : null
        : r.team === homeName ? "home" : r.team === awayName ? "away" : null;
    if (!side) continue;
    out.push(
      market === "moneyline"
        ? { market, side, open_line: null, open_price: r.opening_line }
        : { market, side, open_line: r.opening_line, open_price: null },
    );
  }
  return out;
}

export function useMarketPulse(args: {
  sport: string;
  gameId: string | number | undefined;
  /** The feed id odds_history uses (MLB: espn_mlb_<id>) */
  externalId?: string | null;
  homeName?: string;
  awayName?: string;
  /** The sheet's odds-table rows: the line fallback for markets with no stored line */
  books: Array<OddsRowLike & { sportsbook: string }>;
  enabled: boolean;
}): MarketPulseState {
  const { sport, gameId, externalId, homeName, awayName, books, enabled } = args;
  const stored = SPLITS_SPORTS.has(sport);
  const query = useQuery({
    queryKey: ["market-pulse", sport, String(gameId), externalId ?? null],
    enabled: enabled && gameId != null,
    staleTime: 60_000,
    queryFn: async () => {
      const id = String(gameId);
      const [lines, splits, history] = await Promise.all([
        stored
          ? supabase
              .from("betting_lines")
              .select("market, side, line, price, open_line, open_price, captured_at")
              .eq("source", "draftkings")
              .eq("sport", sport)
              .eq("game_id", id)
              .then(({ data, error }) => {
                if (error) throw error;
                return data ?? [];
              })
          : [],
        stored
          ? supabase
              .from("betting_splits")
              .select("market, side, bets_pct, handle_pct, captured_at, source_as_of")
              .eq("source", "draftkings")
              .eq("sport", sport)
              .eq("game_id", id)
              .then(({ data, error }) => {
                if (error) throw error;
                return data ?? [];
              })
          : [],
        !stored && externalId
          ? supabase
              .from("odds_history")
              .select("game_id, bookmaker, odds_type, team, opening_line, timestamp")
              .eq("sport", sport)
              .eq("game_id", externalId)
              .eq("bookmaker", "draftkings")
              .order("timestamp", { ascending: false })
              .limit(60)
              .then(({ data, error }) => {
                if (error) throw error;
                return (data ?? []) as HistoryRow[];
              })
          : [],
      ]);
      return { lines, splits, history };
    },
  });

  const dk = books.find((b) => b.sportsbook?.toLowerCase().includes("draftkings")) ?? null;
  const pulse = useMemo(() => {
    if (!query.data) return null;
    return buildMarketPulse({
      splits: query.data.splits,
      lines: query.data.lines,
      odds: dk,
      opens: historyOpens(query.data.history, homeName, awayName),
    });
  }, [query.data, dk, homeName, awayName]);

  return {
    pulse,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
