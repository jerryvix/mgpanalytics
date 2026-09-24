// A streak hitter's next game and the starter he faces, for the Active Hit
// Streaks table. Kept out of the component file so the logic is testable and
// fast refresh keeps working.
import { nextMatchupForTeam, teamPlaysOn, type PitcherLine, type ProbableMatchup } from "@/services/mlb/probablePitchers";

/** The fields of a streak row this needs (a subset of HitStreakRow). */
export interface StreakTeamRow {
  /** Full team name. */
  teamName: string | null;
  /** Synced next game (mlb_games), the fallback while MLB's data is missing. */
  nextOpponent: string | null;
  nextOpponentAbbr: string | null;
  nextPitcher: string | null;
  nextGameDate: string | null;
}

export interface ResolvedMatchup {
  opponent: string | null;
  opponentAbbr: string | null;
  gameDate: string | null;
  pitcherName: string | null;
  /** Official, projected (pitcherLine.projected) or null = TBD. */
  pitcherLine: PitcherLine | null;
  /** The team has no game today (Pacific); the matchup shown is its next one. */
  offToday: boolean;
  /** Weekday of that next game ("Fri"), set only when offToday. */
  nextDay: string | null;
}

// The table's times are Pacific (owner's call), so "today" is too.
const PT_DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Los_Angeles" });
const PT_YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" });

/**
 * MLB's schedule is the authority: announced probables, or ESPN's projection
 * labeled "Projected" with the same stats, or TBD. The synced row is used only
 * while MLB's data is missing (loading or unreachable), and then without the
 * projected label because it cannot tell the two apart.
 */
export function resolveMatchup(
  r: StreakTeamRow,
  matchups: ProbableMatchup[] | undefined,
  teamAbbr?: (teamName: string) => string | null,
  now: number = Date.now()
): ResolvedMatchup {
  const degraded: ResolvedMatchup = {
    opponent: r.nextOpponent,
    opponentAbbr: r.nextOpponentAbbr,
    gameDate: r.nextGameDate,
    pitcherName: r.nextPitcher,
    pitcherLine: null,
    offToday: false,
    nextDay: null,
  };
  if (!matchups || !r.teamName) return degraded;

  const offToday = !teamPlaysOn(matchups, r.teamName, PT_YMD.format(new Date(now)));
  const next = nextMatchupForTeam(matchups, r.teamName, now, { includeRecentFinal: true });
  if (!next) {
    // Next game beyond MLB's window: keep the synced opponent, starter TBD.
    return {
      ...degraded,
      pitcherName: null,
      offToday,
      nextDay: offToday && r.nextGameDate ? PT_DAY.format(new Date(r.nextGameDate)) : null,
    };
  }
  const { game } = next.matchup;
  const opponent = next.isHome ? game.away.name : game.home.name;
  const pitcherLine = next.isHome ? next.matchup.away : next.matchup.home;
  return {
    opponent,
    opponentAbbr: teamAbbr?.(opponent) ?? (opponent === r.nextOpponent ? r.nextOpponentAbbr : null),
    gameDate: game.gameDate,
    pitcherName: pitcherLine?.name ?? null,
    pitcherLine,
    offToday,
    nextDay: offToday ? PT_DAY.format(new Date(game.gameDate)) : null,
  };
}
