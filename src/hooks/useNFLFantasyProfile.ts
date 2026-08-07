// Fantasy trajectory data for one NFL player. nflverse rows are keyed by GSIS
// id while our player pages are keyed by BDL players - so we match by
// normalized name + position group, then hydrate every ranked season plus the
// prior-season second-half (weeks 10-18) window.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getFantasyPosGroup, normalizePlayerName } from "@/utils/fantasyTrends";

export interface FantasySeasonRank {
  gsis_id: string | null;
  season: number | null;
  player_name: string | null;
  position: string | null;
  pos_group: string | null;
  team: string | null;
  total_std: number | null;
  total_ppr: number | null;
  games: number | null;
  ppg_ppr: number | null;
  position_rank: number | null;
  ppg_position_rank: number | null;
}

export interface FantasySecondHalfRank {
  gsis_id: string | null;
  season: number | null;
  player_name: string | null;
  pos_group: string | null;
  second_half_ppr: number | null;
  second_half_games: number | null;
  second_half_ppg: number | null;
  second_half_rank: number | null;
}

/** Pick the gsis_id whose rows best match the target player. */
function matchCandidates(
  rows: FantasySeasonRank[],
  targetName: string,
  teamAbbr?: string | null
): FantasySeasonRank[] {
  const target = normalizePlayerName(targetName);
  const targetLast = target.split(" ").pop() ?? "";
  const targetInitial = target[0] ?? "";

  const byGsis = new Map<string, FantasySeasonRank[]>();
  for (const row of rows) {
    if (!row.gsis_id) continue;
    const list = byGsis.get(row.gsis_id) ?? [];
    list.push(row);
    byGsis.set(row.gsis_id, list);
  }

  const nameOf = (list: FantasySeasonRank[]) => normalizePlayerName(list[0]?.player_name ?? "");

  // Exact normalized-name matches first, then last-name + first-initial.
  let candidates = [...byGsis.values()].filter((list) => nameOf(list) === target);
  if (candidates.length === 0) {
    candidates = [...byGsis.values()].filter((list) => {
      const name = nameOf(list);
      return (name.split(" ").pop() ?? "") === targetLast && name[0] === targetInitial;
    });
  }
  if (candidates.length === 0) return [];

  // Disambiguate same-named players: prefer a current-team match on the most
  // recent season, then whoever played most recently.
  if (candidates.length > 1) {
    const latest = (list: FantasySeasonRank[]) =>
      list.reduce((a, b) => ((a.season ?? 0) >= (b.season ?? 0) ? a : b));
    if (teamAbbr) {
      const teamMatches = candidates.filter((list) => latest(list).team === teamAbbr);
      if (teamMatches.length >= 1) candidates = teamMatches;
    }
    candidates.sort((a, b) => (latest(b).season ?? 0) - (latest(a).season ?? 0));
  }

  return candidates[0].sort((a, b) => (a.season ?? 0) - (b.season ?? 0));
}

export function useNFLFantasyProfile(
  playerName: string | null | undefined,
  position: string | null | undefined,
  teamAbbr?: string | null
) {
  const posGroup = getFantasyPosGroup(position);

  const seasonsQuery = useQuery({
    queryKey: ["nfl-fantasy-seasons", playerName, posGroup, teamAbbr],
    queryFn: async (): Promise<FantasySeasonRank[]> => {
      // Broad ilike on the last name; exact matching happens client-side where
      // punctuation differences ("A.J." vs "AJ") can be normalized away.
      const rawLast = playerName!
        .replace(/\s+(Jr|Sr|II|III|IV|V)\.?$/i, "")
        .trim()
        .split(/\s+/)
        .pop()!
        .replace(/[.'’]/g, "");
      const { data, error } = await supabase
        .from("nfl_fantasy_season_ranks")
        .select("*")
        .eq("pos_group", posGroup!)
        .ilike("player_name", `%${rawLast}%`);
      if (error) throw error;
      return matchCandidates((data ?? []) as FantasySeasonRank[], playerName!, teamAbbr);
    },
    enabled: !!playerName && !!posGroup,
    staleTime: 5 * 60 * 1000,
  });

  const seasons = seasonsQuery.data ?? [];
  const gsisId = seasons[0]?.gsis_id ?? null;
  const latestSeason = seasons.length
    ? Math.max(...seasons.map((s) => s.season ?? 0))
    : null;

  const secondHalfQuery = useQuery({
    queryKey: ["nfl-fantasy-second-half", gsisId, latestSeason],
    queryFn: async (): Promise<FantasySecondHalfRank | null> => {
      const { data, error } = await supabase
        .from("nfl_fantasy_second_half_ranks")
        .select("*")
        .eq("gsis_id", gsisId!)
        .eq("season", latestSeason!)
        .maybeSingle();
      if (error) throw error;
      return data as FantasySecondHalfRank | null;
    },
    enabled: !!gsisId && !!latestSeason,
    staleTime: 5 * 60 * 1000,
  });

  return {
    seasons,
    latestSeason,
    secondHalf: secondHalfQuery.data ?? null,
    isLoading: seasonsQuery.isLoading || (!!gsisId && secondHalfQuery.isLoading),
    isError: seasonsQuery.isError,
    matched: !seasonsQuery.isLoading && seasons.length > 0,
  };
}
