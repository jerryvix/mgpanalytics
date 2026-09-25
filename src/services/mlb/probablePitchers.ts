// Probable starters with their season and last-three-start lines, straight
// from MLB's public Stats API (statsapi.mlb.com: free, keyless, CORS-open; the
// same client-side pattern as batterVsPitcher.ts). The parsing and the
// official/projected/TBD rule live in the edge functions' shared module, so the
// slate, the game sheet, the hit streak table and the chat all agree.
import { supabase } from "@/integrations/supabase/client";
import {
  addDays,
  etDate,
  expectedStart,
  fetchProbableMatchups,
  matchupKey,
  nextMatchupForTeam,
  teamKey,
  type PitcherLine,
  type ProbableMatchup,
  type ProjectionRow,
} from "../../../supabase/functions/_shared/mlb-statsapi";

export type { PitcherLine, ProbableMatchup };
export { nextMatchupForTeam };

/**
 * Yesterday (games still in progress past midnight) through three days out.
 * Starters MLB has not announced fall back to the ESPN projection our sync
 * stored on mlb_games, labeled projected; if that read fails we still return
 * the official starters.
 */
export async function loadProbableWindow(now: Date = new Date()): Promise<ProbableMatchup[]> {
  const today = etDate(now);
  const start = addDays(today, -1);
  const end = addDays(today, 3);
  let projections: ProjectionRow[] = [];
  const { data, error } = await supabase
    .from("mlb_games")
    .select("date, home_team_name, visitor_team_name, starting_pitcher_home, starting_pitcher_away")
    .gte("date", `${start}T04:00:00Z`)
    .lt("date", `${addDays(end, 1)}T12:00:00Z`)
    .order("date", { ascending: true });
  if (error) console.error("Projected starters unavailable:", error.message);
  else projections = (data ?? []) as ProjectionRow[];
  return fetchProbableMatchups(start, end, Number(today.slice(0, 4)), projections);
}

interface GameLike {
  date: string;
  home_team_name: string;
  visitor_team_name: string;
}

/**
 * The statsapi game for one of our mlb_games rows: same Eastern scoreboard day
 * and matchup, and for doubleheaders the one whose first pitch is closest
 * (expectedStart: game 2's TBD placeholder, five minutes after game 1, must
 * not claim game 1's row).
 */
export function findMatchupForGame(matchups: ProbableMatchup[] | undefined, game: GameLike): ProbableMatchup | null {
  if (!matchups?.length) return null;
  const key = matchupKey(etDate(game.date), game.visitor_team_name, game.home_team_name);
  const t = Date.parse(game.date);
  let best: ProbableMatchup | null = null;
  let bestGap = Infinity;
  for (const m of matchups) {
    if (m.game.isPlaceholder) continue;
    if (matchupKey(m.game.scheduleDay, m.game.away.name, m.game.home.name) !== key) continue;
    const gap = Math.abs(expectedStart(m.game) - t);
    if (gap < bestGap) {
      best = m;
      bestGap = gap;
    }
  }
  return best;
}

/** Does the team have a game (not a postponed placeholder) whose first pitch falls on `day` in `timeZone`? */
export function teamPlaysOn(
  matchups: ProbableMatchup[],
  teamName: string,
  day: string,
  timeZone = "America/Los_Angeles",
): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone });
  const key = teamKey(teamName);
  return matchups.some(
    (m) =>
      !m.game.isPlaceholder &&
      (teamKey(m.game.home.name) === key || teamKey(m.game.away.name) === key) &&
      fmt.format(new Date(m.game.gameDate)) === day
  );
}

const fmtEra = (v: number | null | undefined) => (v === null || v === undefined ? "-" : v.toFixed(2));

/** "3.91 ERA · 1.13 WHIP" */
export function eraWhip(line: PitcherLine | null | undefined): string | null {
  const s = line?.season;
  if (!s) return null;
  return `${fmtEra(s.era)} ERA · ${fmtEra(s.whip)} WHIP`;
}

/** "10-11 · 192 K · 168.0 IP" */
export function recordKIp(line: PitcherLine | null | undefined): string | null {
  const s = line?.season;
  if (!s) return null;
  return `${s.wins}-${s.losses} · ${s.strikeouts} K · ${s.inningsPitched} IP`;
}

/** "L3: 17.1 IP · 3.63 ERA · 21 K" (starts only) */
export function last3Line(line: PitcherLine | null | undefined): string | null {
  const l = line?.last3;
  if (!l) return null;
  const label = l.starts.length === 3 ? "L3" : `L${l.starts.length}`;
  return `${label}: ${l.ip} IP · ${fmtEra(l.era)} ERA · ${l.strikeouts} K`;
}

/** "RHP" / "LHP" */
export const handLabel = (line: PitcherLine | null | undefined) =>
  line?.hand === "L" ? "LHP" : line?.hand === "R" ? "RHP" : null;
