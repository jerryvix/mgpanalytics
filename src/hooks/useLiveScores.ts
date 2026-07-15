import { useQuery } from "@tanstack/react-query";
import { fetchLiveScores, liveKey, type LiveGame, type LiveSport } from "@/lib/liveScores";

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
    /** Live/final game info for a matchup, or undefined if ESPN has nothing today. */
    getGame: (awayName: string, homeName: string): LiveGame | undefined =>
      data?.get(liveKey(awayName, homeName)),
    anyLive: data ? [...data.values()].some((g) => g.state === "in") : false,
  };
}
