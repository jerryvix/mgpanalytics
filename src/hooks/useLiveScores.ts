import { useQuery } from "@tanstack/react-query";
import { fetchLiveScores, pickLiveGame, type LiveGame, type LiveMatchWhen, type LiveSport } from "@/lib/liveScores";

// Polls ESPN's public scoreboard every 60s while the slate is open.
// react-query dedupes by key, so many cards share one request per sport.
export function useLiveScores(sport: LiveSport) {
  const { data } = useQuery({
    queryKey: ["live-scores", sport],
    queryFn: () => fetchLiveScores(sport),
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 30 * 1000,
    retry: 1,
  });

  return {
    /**
     * Live/final game info for a matchup, or undefined if ESPN has nothing for
     * it. Pass the row's scheduled start (and timeTbd for date-only kickoffs):
     * without it, a series or back-to-back row can pick up the previous
     * game's final (src/lib/liveScores.ts, LIVE_MATCH_WINDOW_MS).
     */
    getGame: (awayName: string, homeName: string, when?: LiveMatchWhen | null): LiveGame | undefined =>
      data ? pickLiveGame(data, awayName, homeName, when) : undefined,
    anyLive: data ? [...data.values()].some((list) => list.some((g) => g.state === "in")) : false,
  };
}
