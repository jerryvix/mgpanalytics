import { describe, it, expect, vi, afterEach } from "vitest";
import {
  computeHitStreak,
  espnStyleStatus,
  etDate,
  ipToOuts,
  outsToIp,
  parsePitcherLines,
  parseSchedule,
  nextMatchupForTeam,
  hittingGamesFromSplits,
  type HittingGame,
  type ProbableMatchup,
} from "../../supabase/functions/_shared/mlb-statsapi";
import { findMatchupForGame } from "@/services/mlb/probablePitchers";
import { espnFetch } from "../../supabase/functions/_shared/espn-fetch";

// probablePitchers.ts reads projections through the app's Supabase client;
// these tests never reach it.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const NOW = Date.parse("2026-09-24T12:00:00Z");
const g = (date: string, hits: number, atBats: number, extra: Partial<HittingGame> = {}): HittingGame => ({
  date,
  hits,
  atBats,
  sacFlies: 0,
  ...extra,
});

describe("computeHitStreak (MLB Rule 9.23(b))", () => {
  it("counts consecutive games with a hit and the average during them", () => {
    const r = computeHitStreak([g("2026-09-20", 0, 4), g("2026-09-21", 1, 4), g("2026-09-22", 2, 4), g("2026-09-23", 1, 3)], { now: NOW });
    expect(r.streak).toBe(3);
    expect(r.hits).toBe(4);
    expect(r.atBats).toBe(11);
    expect(r.avg).toBeCloseTo(4 / 11, 10);
  });

  it("does not break (or extend) on a walks-only game", () => {
    const r = computeHitStreak([g("2026-09-21", 1, 4), g("2026-09-22", 0, 0), g("2026-09-23", 1, 3)], { now: NOW });
    expect(r.streak).toBe(2);
  });

  it("ends the streak on a sacrifice fly without a hit", () => {
    const r = computeHitStreak([g("2026-09-21", 1, 4), g("2026-09-22", 0, 0, { sacFlies: 1 }), g("2026-09-23", 1, 3)], { now: NOW });
    expect(r.streak).toBe(1);
  });

  it("keeps the streak when a sacrifice fly comes with a hit", () => {
    const r = computeHitStreak([g("2026-09-22", 1, 3, { sacFlies: 1 }), g("2026-09-23", 1, 4)], { now: NOW });
    expect(r.streak).toBe(2);
  });

  it("orders doubleheaders by game number even when handed out of order", () => {
    const r = computeHitStreak(
      [g("2026-09-23", 0, 3, { gameNumber: 2 }), g("2026-09-22", 1, 4), g("2026-09-23", 2, 4, { gameNumber: 1 })],
      { now: NOW }
    );
    expect(r.streak).toBe(0); // hitless in game 2, the most recent game
  });

  it("hides a streak whose last game is more than a week old but reports the official one", () => {
    const r = computeHitStreak([g("2026-09-01", 1, 4), g("2026-09-02", 1, 4)], { now: NOW, staleDays: 7 });
    expect(r.streak).toBe(0);
    expect(r.stale).toBe(true);
    expect(r.officialStreak).toBe(2);
  });

  it("reads statsapi game-log splits", () => {
    const games = hittingGamesFromSplits([
      { date: "2026-09-23", game: { gamePk: 1, gameNumber: 1 }, stat: { atBats: 4, hits: 1, sacFlies: 0 } },
      { date: "2026-09-23", game: { gamePk: 2, gameNumber: 2 }, stat: { atBats: 2, hits: 0, sacFlies: 1 } },
    ]);
    expect(games).toEqual([
      { date: "2026-09-23", gameNumber: 1, gamePk: 1, atBats: 4, hits: 1, sacFlies: 0 },
      { date: "2026-09-23", gameNumber: 2, gamePk: 2, atBats: 2, hits: 0, sacFlies: 1 },
    ]);
  });
});

describe("statsapi schedule parsing", () => {
  it("never treats a postponed game as a final", () => {
    expect(espnStyleStatus("Final", "Postponed")).toMatchObject({ status: "STATUS_POSTPONED", isFinal: false });
    expect(espnStyleStatus("Final", "Game Over")).toMatchObject({ status: "STATUS_FINAL", isFinal: true });
    expect(espnStyleStatus("Live", "In Progress")).toMatchObject({ status: "STATUS_IN_PROGRESS", state: "in" });
    expect(espnStyleStatus("Preview", "Scheduled")).toMatchObject({ status: "STATUS_SCHEDULED", state: "pre" });
  });

  // Shape of the real Sep 22-23 2026 Blue Jays at Orioles postponement: the
  // placeholder stays on Sep 22 but carries the makeup's officialDate.
  const team = (name: string) => ({ team: { id: 1, name } });
  const schedule = {
    dates: [
      {
        date: "2026-09-22",
        games: [
          {
            gamePk: 824785, gameDate: "2026-09-22T22:35:00Z", officialDate: "2026-09-23", gameNumber: 1, gameType: "R",
            status: { abstractGameState: "Final", detailedState: "Postponed" },
            teams: { away: team("Toronto Blue Jays"), home: team("Baltimore Orioles") },
          },
        ],
      },
      {
        date: "2026-09-23",
        games: [
          {
            gamePk: 824785, gameDate: "2026-09-23T17:35:00Z", officialDate: "2026-09-23", gameNumber: 1, gameType: "R",
            status: { abstractGameState: "Final", detailedState: "Final" },
            teams: { away: { ...team("Toronto Blue Jays"), score: 2 }, home: { ...team("Baltimore Orioles"), score: 4, probablePitcher: { id: 605135, fullName: "Chris Bassitt" } } },
          },
          {
            gamePk: 824784, gameDate: "2026-09-23T22:35:00Z", officialDate: "2026-09-23", gameNumber: 2, gameType: "R",
            status: { abstractGameState: "Final", detailedState: "Final" },
            teams: { away: { ...team("Toronto Blue Jays"), score: 2 }, home: { ...team("Baltimore Orioles"), score: 4 } },
          },
        ],
      },
    ],
  };

  it("files a postponed placeholder under its original day, flagged as a placeholder", () => {
    const games = parseSchedule(schedule);
    expect(games).toHaveLength(3);
    const [ppd, g1, g2] = games;
    expect(ppd).toMatchObject({ scheduleDay: "2026-09-22", officialDate: "2026-09-23", isPlaceholder: true, isFinal: false });
    expect(g1).toMatchObject({ scheduleDay: "2026-09-23", gameNumber: 1, isPlaceholder: false, isFinal: true });
    expect(g1.home).toMatchObject({ score: 4, probable: { id: 605135, name: "Chris Bassitt" } });
    expect(g2).toMatchObject({ scheduleDay: "2026-09-23", gameNumber: 2 });
  });

  it("files late West Coast first pitches under the Eastern day", () => {
    expect(etDate("2026-09-24T02:10:00Z")).toBe("2026-09-23");
    expect(etDate("2026-09-24T16:35:00Z")).toBe("2026-09-24");
  });
});

describe("pitcher lines", () => {
  it("converts innings and outs", () => {
    expect(ipToOuts("5.1")).toBe(16);
    expect(ipToOuts("168.0")).toBe(504);
    expect(outsToIp(52)).toBe("17.1");
  });

  it("uses a traded pitcher's combined season line and aggregates his last three starts", () => {
    const start = (date: string, ip: string, er: number, k: number, h: number, bb: number, win = 0) => ({
      date, opponent: { name: "Opp" }, isHome: true, game: { gamePk: 1, gameNumber: 1 },
      stat: { gamesStarted: 1, inningsPitched: ip, outs: ipToOuts(ip), earnedRuns: er, strikeOuts: k, hits: h, baseOnBalls: bb, wins: win, losses: 0 },
    });
    const relief = { date: "2026-09-20", game: { gamePk: 9 }, stat: { gamesStarted: 0, inningsPitched: "1.0", outs: 3, earnedRuns: 0 } };
    const lines = parsePitcherLines({
      people: [
        {
          id: 669373,
          fullName: "Tarik Skubal",
          pitchHand: { code: "L" },
          stats: [
            {
              type: { displayName: "season" },
              splits: [
                { stat: { wins: 11, losses: 7, era: "2.85", whip: "0.98", strikeOuts: 180, baseOnBalls: 30, inningsPitched: "151.2", gamesStarted: 25, gamesPlayed: 25 } },
                { team: { name: "Detroit Tigers" }, stat: { wins: 7, losses: 5, era: "2.79" } },
                { team: { name: "Los Angeles Dodgers" }, stat: { wins: 4, losses: 2, era: "2.95" } },
              ],
            },
            {
              type: { displayName: "gameLog" },
              splits: [start("2026-09-01", "6.0", 1, 9, 4, 1, 1), start("2026-09-07", "5.1", 3, 6, 6, 2), relief, start("2026-09-13", "6.0", 2, 8, 5, 0), start("2026-09-19", "7.0", 0, 10, 3, 1, 1)],
            },
          ],
        },
      ],
    });
    const line = lines.get(669373)!;
    expect(line.hand).toBe("L");
    expect(line.season).toMatchObject({ wins: 11, losses: 7, era: 2.85, whip: 0.98, strikeouts: 180, inningsPitched: "151.2" });
    expect(line.last3!.starts.map((s) => s.date)).toEqual(["2026-09-07", "2026-09-13", "2026-09-19"]);
    expect(line.last3!.ip).toBe("18.1"); // 16 + 18 + 21 outs
    expect(line.last3!.era).toBeCloseTo((5 * 27) / 55, 10);
    expect(line.last3!.strikeouts).toBe(24);
  });
});

describe("matching our games to MLB's", () => {
  const mk = (gamePk: number, gameDate: string, gameNumber: number, extra: Record<string, unknown> = {}): ProbableMatchup => ({
    game: {
      gamePk, gameDate, officialDate: etDate(gameDate), scheduleDay: etDate(gameDate), isPlaceholder: false, startTimeTBD: false, gameNumber, gameType: "R",
      detailedState: "Scheduled", state: "pre", status: "STATUS_SCHEDULED", isFinal: false, venue: null, weather: null,
      away: { id: 1, name: "Chicago Cubs", score: null, probable: null },
      home: { id: 2, name: "Boston Red Sox", score: null, probable: null },
      ...extra,
    },
    away: null,
    home: null,
  });

  it("pairs doubleheader games by closest first pitch", () => {
    const list = [mk(1, "2026-09-25T17:05:00Z", 1), mk(2, "2026-09-25T22:05:00Z", 2)];
    const row = { date: "2026-09-25T22:10:00Z", visitor_team_name: "Chicago Cubs", home_team_name: "Boston Red Sox" };
    expect(findMatchupForGame(list, row)?.game.gamePk).toBe(2);
  });

  it("finds a team's next game, skipping finals and games long over", () => {
    const now = Date.parse("2026-09-25T20:00:00Z");
    const list = [
      mk(1, "2026-09-24T17:05:00Z", 1),
      mk(2, "2026-09-25T17:05:00Z", 1, { isFinal: true, status: "STATUS_FINAL" }),
      mk(3, "2026-09-25T22:05:00Z", 2),
    ];
    const next = nextMatchupForTeam(list, "Boston Red Sox", now);
    expect(next?.matchup.game.gamePk).toBe(3);
    expect(next?.isHome).toBe(true);
  });
});

describe("espnFetch MLB scoreboard fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries a 403 through the CDN mirror with the date in the path and a fresh cache key", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        seen.push(url);
        if (url.includes("site.api.espn.com")) return new Response("Access Denied", { status: 403 });
        return new Response(JSON.stringify({ content: { sbData: { events: [{ id: "401817063" }] } } }), { status: 200 });
      })
    );
    const res = await espnFetch("https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=20260924");
    expect(res.status).toBe(200);
    expect((await res.json()).events[0].id).toBe("401817063");
    const mirror = new URL(seen[1]);
    expect(mirror.hostname).toBe("cdn.espn.com");
    expect(mirror.pathname).toBe("/core/mlb/scoreboard/_/date/20260924");
    expect(mirror.searchParams.get("dates")).toBeNull();
    expect(mirror.searchParams.get("xhr")).toBe("1");
    expect(mirror.searchParams.get("mgpts")).toMatch(/^\d+$/);
  });
});
