// Data layer for the projection accuracy backtester (Accuracy tab). Reads
// the grading views; all math happens in the tested utils
// (backtestMetrics / backtestArchetypes / backtestTrends / backtestCorrelation).
// Grading views also emit rows for in-progress seasons, so every query here
// filters to completed seasons via mostRecentCompletedNflSeason().
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mostRecentCompletedNflSeason } from "@/utils/nflSeason";

export interface PropResultRow {
  season: number;
  market: string;
  subject_name: string;
  gsis_id: string | null;
  position: string | null;
  line: number;
  over_odds: number | null;
  under_odds: number | null;
  actual: number | null;
  games_played: number | null;
  result: "over" | "under" | "push" | "ungraded";
  source: string;
  book: string | null;
}

export interface WinTotalResultRow {
  season: number;
  subject_name: string;
  team_abbr: string | null;
  line: number;
  over_odds: number | null;
  under_odds: number | null;
  actual: number | null;
  result: "over" | "under" | "push" | "ungraded";
  book: string | null;
}

export interface PlayerSeasonRow {
  season: number;
  gsis_id: string;
  player_name: string;
  position: string;
  team: string | null;
  adp: number;
  adp_pos_rank: number;
  finish_pos_rank: number | null;
  games: number | null;
  experience_year: number | null;
  draft_round: number | null;
  new_team: boolean | null;
}

/** Page through a view - supabase caps a select at 1000 rows. */
async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export function useBacktest() {
  const lastCompleted = mostRecentCompletedNflSeason();

  const props = useQuery({
    queryKey: ["backtest-props", lastCompleted],
    queryFn: () =>
      fetchAll<PropResultRow>((from, to) =>
        supabase
          .from("nfl_backtest_prop_results")
          .select("season, market, subject_name, gsis_id, position, line, over_odds, under_odds, actual, games_played, result, source, book")
          .lte("season", lastCompleted)
          .range(from, to)
      ),
    staleTime: 60 * 60 * 1000, // completed seasons - effectively static
  });

  const winTotals = useQuery({
    queryKey: ["backtest-win-totals", lastCompleted],
    queryFn: () =>
      fetchAll<WinTotalResultRow>((from, to) =>
        supabase
          .from("nfl_backtest_win_total_results")
          .select("season, subject_name, team_abbr, line, over_odds, under_odds, actual, result, book")
          .lte("season", lastCompleted)
          .range(from, to)
      ),
    staleTime: 60 * 60 * 1000,
  });

  const playerSeasons = useQuery({
    queryKey: ["backtest-player-seasons", lastCompleted],
    queryFn: () =>
      fetchAll<PlayerSeasonRow>((from, to) =>
        supabase
          .from("nfl_backtest_player_season")
          .select("season, gsis_id, player_name, position, team, adp, adp_pos_rank, finish_pos_rank, games, experience_year, draft_round, new_team")
          .lte("season", lastCompleted)
          .range(from, to)
      ),
    staleTime: 60 * 60 * 1000,
  });

  return {
    lastCompleted,
    props,
    winTotals,
    playerSeasons,
    isLoading: props.isLoading || winTotals.isLoading || playerSeasons.isLoading,
    isError: props.isError || winTotals.isError || playerSeasons.isError,
  };
}
