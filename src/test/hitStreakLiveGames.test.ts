import { describe, it, expect } from "vitest";
import {
  computeHitStreak,
  hittingGamesFromSplits,
  parseSchedule,
  unfinishedGamePks,
  type HittingGame,
} from "../../supabase/functions/_shared/mlb-statsapi";

// Final review, Sep 24 2026: statsapi's game log already lists a game in
// progress (Hunter Goodman's 0-for-3 in the live ARI @ COL game was in his
// log), so a sync that ran mid-game read a streak hitter's 0-for-2 so far as a
// hitless game and zeroed the streak until the next sync. The 01:00 UTC run
// lands mid-game for the East Coast slate. Games not final are now skipped.

// The 01:00 UTC sync on Sep 25 (9 PM ET on Sep 24): East Coast games under way
const NOW = Date.parse("2026-09-25T01:00:00Z");
const g = (date: string, gamePk: number, hits: number, atBats: number, extra: Partial<HittingGame> = {}): HittingGame => ({
  date,
  gamePk,
  hits,
  atBats,
  sacFlies: 0,
  ...extra,
});

// A 5-game streak through Sep 23 (Rutschman-style), 7 for 19 during it
const streak5 = [
  g("2026-09-18", 1, 0, 4),
  g("2026-09-19", 2, 1, 4),
  g("2026-09-20", 3, 2, 4),
  g("2026-09-21", 4, 1, 3),
  g("2026-09-22", 5, 1, 4),
  g("2026-09-23", 6, 2, 4),
];
const LIVE = 823411;

describe("hit streaks skip games that are not final", () => {
  it("a hitless game in progress does not end the streak", () => {
    const log = [...streak5, g("2026-09-24", LIVE, 0, 2)];
    // Before: the live 0-for-2 read as a hitless game and the streak showed 0
    expect(computeHitStreak(log, { now: NOW }).streak).toBe(0);
    const r = computeHitStreak(log, { now: NOW, unfinished: new Set([LIVE]) });
    expect(r.streak).toBe(5);
    expect(r).toMatchObject({ hits: 7, atBats: 19, stale: false, officialStreak: 5 });
  });

  it("a hit in a game in progress does not extend it before the final", () => {
    const r = computeHitStreak([...streak5, g("2026-09-24", LIVE, 1, 2)], { now: NOW, unfinished: new Set([LIVE]) });
    expect(r.streak).toBe(5);
    expect(r.hits).toBe(7);
  });

  it("once final, a hitless game ends the streak and a hit extends it", () => {
    expect(computeHitStreak([...streak5, g("2026-09-24", LIVE, 0, 4)], { now: NOW, unfinished: new Set() }).streak).toBe(0);
    const r = computeHitStreak([...streak5, g("2026-09-24", LIVE, 1, 4)], { now: NOW, unfinished: new Set([999]) });
    expect(r).toMatchObject({ streak: 6, hits: 8, atBats: 23 });
  });

  it("doubleheader: game 1 final with a hit counts while game 2 is live and hitless", () => {
    const log = [...streak5, g("2026-09-24", 701, 1, 4, { gameNumber: 1 }), g("2026-09-24", 702, 0, 2, { gameNumber: 2 })];
    expect(computeHitStreak(log, { now: NOW, unfinished: new Set([702]) }).streak).toBe(6);
    // Both final: the hitless nightcap ends it
    expect(computeHitStreak(log, { now: NOW, unfinished: new Set() }).streak).toBe(0);
  });

  it("doubleheader: a hitless final game 1 ends the streak even while game 2 is live with a hit", () => {
    const log = [...streak5, g("2026-09-24", 701, 0, 4, { gameNumber: 1 }), g("2026-09-24", 702, 1, 1, { gameNumber: 2 })];
    expect(computeHitStreak(log, { now: NOW, unfinished: new Set([702]) }).streak).toBe(0);
    // Once game 2 is final, it starts a new one
    expect(computeHitStreak(log, { now: NOW, unfinished: new Set() }).streak).toBe(1);
  });

  it("a game in progress still counts as playing for the staleness guard", () => {
    // Back from the injured list today: last final game 9 days ago
    const log = [g("2026-09-13", 1, 1, 4), g("2026-09-14", 2, 1, 4), g("2026-09-24", LIVE, 0, 1)];
    const r = computeHitStreak(log, { now: NOW, unfinished: new Set([LIVE]) });
    expect(r).toMatchObject({ streak: 2, stale: false });
    // Without today's game he is stale, as before
    expect(computeHitStreak(log.slice(0, 2), { now: NOW }).stale).toBe(true);
  });

  it("reads each game's gamePk from statsapi's log splits", () => {
    const games = hittingGamesFromSplits([
      { date: "2026-09-23", game: { gamePk: 6, gameNumber: 1 }, stat: { atBats: 4, hits: 2, sacFlies: 0 } },
      { date: "2026-09-24", game: { gamePk: LIVE, gameNumber: 1 }, stat: { atBats: 2, hits: 0, sacFlies: 0 } },
    ]);
    expect(computeHitStreak(games, { now: NOW, unfinished: new Set([LIVE]) }).streak).toBe(1);
  });
});

describe("unfinishedGamePks", () => {
  const game = (gamePk: number, date: string, abstractGameState: string, detailedState: string) => ({
    gamePk,
    gameDate: `${date}T23:05:00Z`,
    officialDate: date,
    gameNumber: 1,
    status: { abstractGameState, detailedState },
    teams: { away: { team: { id: 1, name: "A" } }, home: { team: { id: 2, name: "B" } } },
  });
  const schedule = {
    dates: [
      {
        date: "2026-09-22",
        games: [
          game(824785, "2026-09-22", "Final", "Postponed"), // placeholder; the makeup below is final
          game(700, "2026-09-22", "Live", "Suspended: Rain"),
        ],
      },
      {
        date: "2026-09-23",
        games: [game(824785, "2026-09-23", "Final", "Final"), game(701, "2026-09-23", "Final", "Game Over")],
      },
      {
        date: "2026-09-24",
        games: [
          game(823411, "2026-09-24", "Live", "In Progress"),
          game(824707, "2026-09-24", "Live", "Delayed: Rain"),
          game(823493, "2026-09-24", "Preview", "Pre-Game"),
          game(823326, "2026-09-24", "Final", "Final"),
        ],
      },
    ],
  };

  it("lists live, delayed, suspended and not-yet-started games, never a final or a postponed game's makeup", () => {
    const set = unfinishedGamePks(parseSchedule(schedule));
    expect([...set].sort()).toEqual([700, 823411, 823493, 824707].sort());
    expect(set.has(824785)).toBe(false);
    expect(set.has(701)).toBe(false);
    expect(set.has(823326)).toBe(false);
  });
});
