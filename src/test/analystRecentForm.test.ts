import { describe, expect, it } from "vitest";
import {
  currentSeason,
  dayLabel,
  nameSearchTokens,
  playerFormBlock,
  playersNamedIn,
  recentFormAsk,
  recentFormBlock,
  teamFormBlock,
  type GameRow,
  type LogRow,
  type PlayerRow,
} from "../../supabase/functions/gemini-chat/recent-form";

// Tue Nov 24 2026, 1:42 AM ET: Bengals at Commanders (MNF) ended about two
// hours ago; MGP's logs and scores don't have it yet.
const NOW = new Date("2026-11-24T06:42:00Z");

const chase: PlayerRow = {
  id: "p1", name: "Ja'Marr Chase", sport: "NFL", team_name: "Cincinnati Bengals", team_abbr: "CIN", position: "Wide Receiver",
};
const chaseBrown: PlayerRow = {
  id: "p2", name: "Chase Brown", sport: "NFL", team_name: "Cincinnati Bengals", team_abbr: "CIN", position: "Running Back",
};
const chaseLee: PlayerRow = { id: "p3", name: "Chase Lee", sport: "MLB", team_name: "Colorado Rockies", team_abbr: "COL", position: "P" };
const stBrown: PlayerRow = {
  id: "p4", name: "Amon-Ra St. Brown", sport: "NFL", team_name: "Detroit Lions", team_abbr: "DET", position: "Wide Receiver",
};
const mhj: PlayerRow = {
  id: "p5", name: "Marvin Harrison Jr.", sport: "NFL", team_name: "Arizona Cardinals", team_abbr: "ARI", position: "Wide Receiver",
};

const log = (game_date: string, week: number, opp: string, home_away: string, result: string, ts: number, os: number, rec: number, tgt: number, yds: number, td: number): LogRow => ({
  game_date, season: 2026, week, opponent_abbr: opp, home_away, result, team_score: ts, opponent_score: os,
  pass_attempts: 0, pass_completions: 0, pass_yards: 0, pass_td: 0, pass_int: 0, rush_attempts: 0, rush_yards: 0, rush_td: 0,
  targets: tgt, receptions: rec, rec_yards: yds, rec_td: td,
});

const chaseLogs: LogRow[] = [
  log("2026-11-15", 10, "PIT", "home", "W", 38, 18, 11, 14, 231, 0),
  log("2026-11-08", 9, "ATL", "away", "W", 34, 17, 10, 12, 155, 1),
  log("2026-11-01", 8, "TEN", "home", "W", 43, 36, 11, 16, 141, 1),
  log("2026-10-25", 7, "BAL", "away", "W", 35, 13, 5, 7, 62, 1),
  log("2026-10-11", 5, "MIA", "away", "W", 31, 24, 6, 10, 77, 1),
];

const bengalsSchedule: GameRow[] = [
  { date: "2026-11-24T01:15:00Z", status: "11/23 - 8:15 PM EST", is_final: false, home_team_name: "Washington Commanders", visitor_team_name: "Cincinnati Bengals", home_score: null, away_score: null },
  { date: "2026-11-16T01:20:00Z", status: "Final", is_final: true, home_team_name: "Cincinnati Bengals", visitor_team_name: "Pittsburgh Steelers", home_score: 38, away_score: 18 },
  { date: "2026-11-08T14:30:00Z", status: "Final", is_final: true, home_team_name: "Atlanta Falcons", visitor_team_name: "Cincinnati Bengals", home_score: 17, away_score: 34 },
];

describe("recent-form questions", () => {
  it("reads last N, last game, season and recent wording", () => {
    expect(recentFormAsk("Ja'Marr Chase last 5 games")).toEqual({ count: 5, season: false });
    expect(recentFormAsk("how has chase done the past three games")).toEqual({ count: 3, season: false });
    expect(recentFormAsk("Chase's last game")).toEqual({ count: 1, season: false });
    expect(recentFormAsk("how did burrow play last night")).toEqual({ count: 1, season: false });
    expect(recentFormAsk("Chase stats this season")).toEqual({ count: 5, season: true });
    expect(recentFormAsk("how has LeBron looked lately")).toEqual({ count: 5, season: false });
    expect(recentFormAsk("last 40 games")?.count).toBe(15);
    expect(recentFormAsk("Bengals spread vs Saints")).toBeNull();
    expect(recentFormAsk("who leads the NFL in receiving yards")).toBeNull();
  });

  it("knows the season a log row belongs to", () => {
    expect(currentSeason("NFL", NOW)).toBe(2026);
    expect(currentSeason("NFL", new Date("2027-01-20T12:00:00Z"))).toBe(2026);
    expect(currentSeason("NBA", NOW)).toBe(2027);
  });
});

describe("players named in a question", () => {
  const rows = [chase, chaseBrown, chaseLee, stBrown, mhj];

  it("matches a full name with or without punctuation", () => {
    expect(playersNamedIn("Ja'Marr Chase last 5 games", rows)).toEqual([chase]);
    expect(playersNamedIn("jamarr chase last 5 games", rows)).toEqual([chase]);
    expect(playersNamedIn("chase brown last 5", rows)).toEqual([chaseBrown]);
    expect(playersNamedIn("amon-ra st. brown lately", rows)).toEqual([stBrown]);
    expect(playersNamedIn("Amon Ra St Brown lately", rows)).toEqual([stBrown]);
    expect(playersNamedIn("marvin harrison last 3 games", rows)).toEqual([mhj]);
  });

  it("takes a capitalized last name only when it names one player", () => {
    expect(playersNamedIn("How has Chase looked lately?", rows)).toEqual([chase]);
    expect(playersNamedIn("how has chase looked lately?", rows)).toEqual([]);
    expect(playersNamedIn("How has Brown looked lately?", rows)).toEqual([]);
  });

  it("searches names by the question's meaningful words", () => {
    expect(nameSearchTokens("How has Ja'Marr Chase done in his last 5 games?")).toEqual(["jamarr", "chase"]);
  });
});

describe("player recent form block", () => {
  it("lists the logs and the Monday night game they don't include yet", () => {
    const block = playerFormBlock(chase, chaseLogs, bengalsSchedule, { count: 5, season: false }, NOW);
    expect(block).toContain("📒 Ja'Marr Chase (Cincinnati Bengals, Wide Receiver), MGP game logs, newest 5, newest first:");
    expect(block).toContain("• Sun, Nov 15 (Wk 10) vs PIT, W 38-18: 11 rec (14 tgt), 231 rec yds, 0 rec TD");
    expect(block).toContain("• Sun, Nov 8 (Wk 9) at ATL, W 34-17: 10 rec (12 tgt), 155 rec yds, 1 rec TD");
    expect(block).toContain("Totals, these 5 games: 43 rec (59 tgt), 666 rec yds, 4 rec TD");
    expect(block).toContain("FRESHNESS: today is Tue, Nov 24. These logs run through Sun, Nov 15.");
    expect(block).toContain("• Mon, Nov 23, 8:15 PM ET: Cincinnati Bengals at Washington Commanders (kicked off; no final in MGP data yet)");
    expect(block).toContain('a "last 5" answer is then his 5 most recent completed games, this one included');
    for (const code of [0x2013, 0x2014, 0x2212]) expect(block).not.toContain(String.fromCharCode(code));
  });

  it("says the logs are current when the team hasn't played since", () => {
    const before = new Date("2026-11-20T12:00:00Z");
    const block = playerFormBlock(chase, chaseLogs, bengalsSchedule, { count: 5, season: false }, before);
    expect(block).toContain("the Cincinnati Bengals have not played since then (per the schedule), so they are current");
    expect(block).not.toContain("web search");
  });

  it("marks a game MGP has as final but not yet in the logs", () => {
    const finalSchedule = [{ ...bengalsSchedule[0], is_final: true, status: "Final", home_score: 17, away_score: 24 }, ...bengalsSchedule.slice(1)];
    const block = playerFormBlock(chase, chaseLogs, finalSchedule, { count: 1, season: false }, NOW);
    expect(block).toContain("(final in MGP scores, Cincinnati Bengals 24, Washington Commanders 17; his stats for it aren't in the logs yet)");
    expect(block).toContain("it is his most recent game");
  });

  it("labels an earlier season's dates with the year", () => {
    expect(dayLabel("2026-11-01", NOW)).toBe("Sun, Nov 1");
    expect(dayLabel("2026-04-23", NOW)).toBe("Thu, Apr 23 '26");
    expect(dayLabel("2025-12-28", NOW)).toBe("Sun, Dec 28 '25");
  });

  it("never calls the logs current when the schedule read came back empty", () => {
    const block = playerFormBlock(chase, chaseLogs, [], { count: 5, season: false }, NOW);
    expect(block).not.toContain("so they are current");
    expect(block).toContain("schedule since then couldn't be checked");
    expect(block).toContain("web search Ja'Marr Chase's newest games");
  });
});

describe("team recent form block", () => {
  it("gives the newest finals and the game with no final yet", () => {
    const block = teamFormBlock("Cincinnati Bengals", bengalsSchedule, { count: 5, season: false }, NOW);
    expect(block).toContain("• Sun, Nov 15: vs Pittsburgh Steelers, W 38-18");
    expect(block).toContain("• Sun, Nov 8: at Atlanta Falcons, W 34-17");
    expect(block).toContain("kicked off after the newest final above");
    expect(block).toContain("• Mon, Nov 23, 8:15 PM ET: Cincinnati Bengals at Washington Commanders (kicked off; no final in MGP data yet)");
    expect(block).toContain("count it as the Cincinnati Bengals' newest result");
  });
});

describe("recentFormBlock reads", () => {
  // A minimal stand-in for the Supabase query builder: every call chains,
  // awaiting resolves to the rows registered for that table.
  function fakeDb(tables: Record<string, (filters: Record<string, unknown>) => unknown[]>) {
    return {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder: Record<string, unknown> = {};
        for (const m of ["select", "in", "not", "or", "order", "limit", "lt", "gte"]) builder[m] = () => builder;
        builder.eq = (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        };
        builder.then = (resolve: (v: unknown) => void) => resolve({ data: tables[table]?.(filters) ?? [], error: null });
        return builder;
      },
    };
  }

  it("builds the Chase block end to end", async () => {
    const db = fakeDb({
      players: () => [chase, chaseBrown],
      player_game_logs: () => chaseLogs,
      games: (f) => bengalsSchedule.filter((g) => (f.home_team_name ? g.home_team_name === f.home_team_name : g.visitor_team_name === f.visitor_team_name)),
    });
    const out = await recentFormBlock(db, { message: "Ja'Marr Chase last 5 games", league: null, teams: [], now: NOW });
    expect(out.startsWith("[MGP DATA: RECENT FORM]")).toBe(true);
    expect(out).toContain("Ja'Marr Chase (Cincinnati Bengals, Wide Receiver)");
    expect(out).not.toContain("Chase Brown (");
    expect(out).toContain("Mon, Nov 23, 8:15 PM ET: Cincinnati Bengals at Washington Commanders");
  });

  it("returns nothing for a question that isn't about recent form", async () => {
    const out = await recentFormBlock(fakeDb({}), { message: "Bengals spread vs Saints", league: "NFL", teams: ["Cincinnati Bengals"], now: NOW });
    expect(out).toBe("");
  });
});
