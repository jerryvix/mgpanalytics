// Matchup intelligence for one CFB game: roster continuity (CFBD returning
// production + portal + draft departures), head-to-head history, and draft
// talent density, classified into per-signal leans and one composite.
// Team identity: ESPN display names are resolved to CFBD school names via
// candidate prefixes matched against rows that actually exist - a miss just
// leaves that signal on its "insufficient" arm.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cfbdSchoolCandidates, pickCfbdSchool } from "@/utils/cfbdSchools";
import {
  classifyContinuity,
  continuityEdge,
  classifyH2H,
  classifyTalentEdge,
  compositeVerdict,
  type ContinuityInput,
  type ContinuityVerdict,
  type H2HGameRow,
  type H2HSummary,
  type SignalLean,
  type CompositeVerdict,
  type TalentEdgeResult,
} from "@/utils/matchupIntel";

export interface ContinuityRow {
  school: string;
  conference: string | null;
  percent_ppa: number | null;
  percent_passing_ppa: number | null;
  percent_receiving_ppa: number | null;
  percent_rushing_ppa: number | null;
  portal_in: number | null;
  portal_out: number | null;
  net_portal: number | null;
  draft_departures: number | null;
}

export interface ProspectRow {
  rank: number;
  player_name: string;
  position: string | null;
  school: string;
  captured_at: string;
}

const toInput = (row: ContinuityRow | null): ContinuityInput => ({
  percentPpa: row?.percent_ppa ?? null,
  portalIn: row?.portal_in ?? null,
});

function devWarnUnresolved(displayName: string, candidates: string[]) {
  if (import.meta.env.DEV) {
    console.warn(
      `[useMatchupIntel] No CFBD school matched "${displayName}" (tried: ${candidates.join(", ")}) - add it to CFBD_SCHOOL_OVERRIDES if this is an FBS team`
    );
  }
}

export function useMatchupIntel(
  homeDisplayName: string | null | undefined,
  visitorDisplayName: string | null | undefined,
  season: number,
  enabled = true
) {
  const homeCandidates = homeDisplayName ? cfbdSchoolCandidates(homeDisplayName) : [];
  const awayCandidates = visitorDisplayName ? cfbdSchoolCandidates(visitorDisplayName) : [];
  const ready = enabled && homeCandidates.length > 0 && awayCandidates.length > 0;

  // Signal 3 - roster continuity (also resolves the CFBD school names the
  // other signals key off)
  const continuityQuery = useQuery({
    queryKey: ["matchup-continuity", season, homeDisplayName, visitorDisplayName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ncaaf_roster_continuity")
        .select("*")
        .eq("season", season)
        .in("school", [...homeCandidates, ...awayCandidates]);
      if (error) throw error;

      const rows = (data ?? []) as ContinuityRow[];
      const available = new Set(rows.map((r) => r.school));
      const homeSchool = pickCfbdSchool(homeCandidates, available);
      const awaySchool = pickCfbdSchool(awayCandidates, available);
      if (!homeSchool) devWarnUnresolved(homeDisplayName!, homeCandidates);
      if (!awaySchool) devWarnUnresolved(visitorDisplayName!, awayCandidates);

      return {
        homeSchool,
        awaySchool,
        home: rows.find((r) => r.school === homeSchool) ?? null,
        away: rows.find((r) => r.school === awaySchool) ?? null,
      };
    },
    enabled: ready,
    staleTime: 5 * 60 * 1000,
  });

  const homeSchool = continuityQuery.data?.homeSchool ?? null;
  const awaySchool = continuityQuery.data?.awaySchool ?? null;

  // Signal 2 - head-to-head, last 5 seasons. RPC handles both home/away
  // orientations in SQL (school names with parens break PostgREST or()
  // filters, so this stays server-side).
  const h2hQuery = useQuery({
    queryKey: ["matchup-h2h", homeSchool, awaySchool],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ncaaf_head_to_head", {
        p_team1: homeSchool!,
        p_team2: awaySchool!,
        p_seasons: 5,
      });
      if (error) throw error;
      return (data ?? {}) as { games?: H2HGameRow[] };
    },
    enabled: ready && !!homeSchool && !!awaySchool,
    staleTime: 5 * 60 * 1000,
  });

  // Signal 1 - draft talent from the consensus board for the upcoming draft.
  // The whole board is ~100 rows; fetch it once so captured_at is known even
  // when neither team has a prospect on it.
  const draftYear = season + 1;
  const boardQuery = useQuery({
    queryKey: ["matchup-draft-board", draftYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ncaaf_draft_prospects")
        .select("rank, player_name, position, school, captured_at")
        .eq("draft_year", draftYear)
        .order("rank", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProspectRow[];
    },
    enabled: ready,
    staleTime: 5 * 60 * 1000,
  });

  const board = boardQuery.data ?? [];
  const capturedAt = board[0]?.captured_at ?? null;
  const homeProspects = homeSchool ? board.filter((p) => p.school === homeSchool) : [];
  const awayProspects = awaySchool ? board.filter((p) => p.school === awaySchool) : [];

  // Classify
  const homeInput = toInput(continuityQuery.data?.home ?? null);
  const awayInput = toInput(continuityQuery.data?.away ?? null);
  const continuityLean: SignalLean = continuityEdge(homeInput, awayInput);
  const homeVerdict: ContinuityVerdict = classifyContinuity(homeInput);
  const awayVerdict: ContinuityVerdict = classifyContinuity(awayInput);

  const h2hGames = h2hQuery.data?.games ?? [];
  const h2hSummary: H2HSummary | null =
    homeSchool && awaySchool && !h2hQuery.isLoading
      ? classifyH2H(h2hGames, homeSchool, awaySchool)
      : null;
  const h2hLean: SignalLean =
    h2hSummary == null || h2hSummary.verdict === "insufficient"
      ? "insufficient"
      : h2hSummary.verdict === "team1_owns"
        ? "home"
        : h2hSummary.verdict === "team2_owns"
          ? "away"
          : "even";

  const talent: TalentEdgeResult = classifyTalentEdge(
    homeProspects.map((p) => p.rank),
    awayProspects.map((p) => p.rank),
    // A board that exists for a different matchup's teams still counts;
    // one with zero rows total means no capture yet → insufficient.
    board.length > 0 ? capturedAt : null
  );

  const composite: CompositeVerdict = compositeVerdict({
    continuity: continuityLean,
    talent: talent.lean,
    h2h: h2hLean,
  });

  const isLoading =
    continuityQuery.isLoading || boardQuery.isLoading || (!!homeSchool && !!awaySchool && h2hQuery.isLoading);

  return {
    isLoading,
    isError: continuityQuery.isError,
    homeSchool,
    awaySchool,
    continuity: {
      home: continuityQuery.data?.home ?? null,
      away: continuityQuery.data?.away ?? null,
      homeVerdict,
      awayVerdict,
      lean: continuityLean,
    },
    h2h: {
      games: h2hGames,
      summary: h2hSummary,
      lean: h2hLean,
    },
    talent: {
      homeProspects,
      awayProspects,
      capturedAt,
      result: talent,
    },
    composite,
    /** Any signal has real data - drives whether the section renders at all. */
    matched: !isLoading && composite.signalsUsed > 0,
  };
}
