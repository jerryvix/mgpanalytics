// Team-leader rules for nfl-slate-leaders. Pure (no Deno or network), so
// vitest pins them: src/test/nflSlateLeaders.test.ts.
import { passerRating } from "../_shared/nfl-sync.ts";

export interface BDLTeam {
  id: number;
  abbreviation: string;
  full_name: string;
  name: string;
}

export interface SeasonLine {
  player: {
    id: number;
    first_name: string;
    last_name: string;
    position?: string;
    position_abbreviation?: string;
    jersey_number?: string | null;
  };
  games_played?: number | null;
  qbr?: number | null;
  passing_yards?: number | null;
  passing_touchdowns?: number | null;
  passing_interceptions?: number | null;
  passing_attempts?: number | null;
  passing_completions?: number | null;
  rushing_yards?: number | null;
  rushing_touchdowns?: number | null;
  receiving_yards?: number | null;
  receiving_touchdowns?: number | null;
  receptions?: number | null;
}

export interface LeaderPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_abbreviation: string;
  team: BDLTeam;
  jersey_number: string | null;
  stat_value: number;
  stat_type: string;
  rank: number;
  detailed_stats: Record<string, number | null | undefined>;
  headshot_url: string | null;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const perGame = (total: number, gp: number) => Math.round((total / Math.max(gp, 1)) * 10) / 10;

function posAbbr(line: SeasonLine): string {
  const abbr = line.player.position_abbreviation;
  if (abbr) return abbr.toUpperCase();
  const map: Record<string, string> = {
    quarterback: "QB", "running back": "RB", fullback: "FB", "wide receiver": "WR", "tight end": "TE",
  };
  return map[(line.player.position ?? "").toLowerCase()] ?? "";
}

function toLeader(line: SeasonLine, team: BDLTeam, statType: string, value: number, detailed: LeaderPlayer["detailed_stats"]): LeaderPlayer {
  return {
    id: line.player.id,
    first_name: line.player.first_name,
    last_name: line.player.last_name,
    position: line.player.position ?? posAbbr(line),
    position_abbreviation: posAbbr(line),
    team,
    jersey_number: line.player.jersey_number ?? null,
    stat_value: value,
    stat_type: statType,
    rank: 0,
    detailed_stats: detailed,
    headshot_url: null,
  };
}

// A team's leader in each category is whoever has the most yards in it,
// whatever the position: ESPN's team leaders count Bijan Robinson's 99
// receiving yards over Drake London's 80, and a running quarterback can lead
// a team in rushing. (The cards used to restrict receiving to WR/TE and
// rushing to RB/FB.)
export function teamLeaders(lines: SeasonLine[], team: BDLTeam) {
  const best = (key: keyof SeasonLine) =>
    lines
      .filter((l) => num(l[key]) > 0)
      .sort((a, b) => num(b[key]) - num(a[key]))[0];

  const qb = best("passing_yards");
  const rb = best("rushing_yards");
  const wr = best("receiving_yards");

  const passing = qb
    ? toLeader(qb, team, "Passing Yards", num(qb.passing_yards), {
        // The card labels this "QBR": use ESPN's real QBR from BDL (the old
        // function computed its own 0-100 score). Passer rating rides along.
        qbr: typeof qb.qbr === "number" ? Math.round(qb.qbr * 10) / 10 : undefined,
        passer_rating: passerRating(
          num(qb.passing_completions), num(qb.passing_attempts), num(qb.passing_yards),
          num(qb.passing_touchdowns), num(qb.passing_interceptions),
        ),
        passing_yards: num(qb.passing_yards),
        passing_yards_per_game: perGame(num(qb.passing_yards), num(qb.games_played)),
        passing_touchdowns: num(qb.passing_touchdowns),
        interceptions: qb.passing_interceptions ?? null,
        rushing_yards: num(qb.rushing_yards),
        games_played: num(qb.games_played),
      })
    : null;
  const rushing = rb
    ? toLeader(rb, team, "Rushing Yards", num(rb.rushing_yards), {
        rushing_yards: num(rb.rushing_yards),
        rushing_yards_per_game: perGame(num(rb.rushing_yards), num(rb.games_played)),
        rushing_touchdowns: num(rb.rushing_touchdowns),
        receptions: num(rb.receptions),
        receiving_yards: num(rb.receiving_yards),
        games_played: num(rb.games_played),
      })
    : null;
  const receiving = wr
    ? toLeader(wr, team, "Receiving Yards", num(wr.receiving_yards), {
        receiving_yards: num(wr.receiving_yards),
        receiving_yards_per_game: perGame(num(wr.receiving_yards), num(wr.games_played)),
        receptions: num(wr.receptions),
        receiving_touchdowns: num(wr.receiving_touchdowns),
        games_played: num(wr.games_played),
      })
    : null;
  return { passing, rushing, receiving };
}

// Visitor first, then home (away-first convention used across MGP). The
// #1/#2 rank follows the stat itself, not the side: Jordan Love's 532 is #1
// even when he is listed second. Ties share #1.
export function pairByValue(away: LeaderPlayer | null, home: LeaderPlayer | null): LeaderPlayer[] {
  const out = [away, home].filter((p): p is LeaderPlayer => p !== null);
  return out.map((p) => ({
    ...p,
    rank: 1 + out.filter((o) => o.stat_value > p.stat_value).length,
  }));
}
