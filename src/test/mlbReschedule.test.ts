import { describe, it, expect } from "vitest";
import {
  espnEventId,
  pairGames,
  planStranded,
  strandedRows,
  type SyncRow,
} from "../../supabase/functions/sync-mlb-games/reconcile";
import { matchProjectionRows, matchupKey, type MlbScheduleGame } from "../../supabase/functions/_shared/mlb-statsapi";
import { isCalledOffStatus } from "@/lib/gameStatus";

// Final review, Sep 25 2026: Saturday's Orioles @ Yankees was moved to Friday
// as doubleheader game 1 (4:05 PM ET). ESPN kept event 401817088 and re-dated
// it, but the scoreboard mirror the sync reads had dropped it from Saturday
// without listing it on Friday yet, so the row stayed on Saturday: a phantom
// "Sat, TBD vs TBD" card, and no Friday game 1.

const BAL = "Baltimore Orioles";
const NYY = "New York Yankees";

const row = (external_id: string, date: string, extra: Partial<SyncRow> = {}): SyncRow => ({
  id: external_id,
  external_id,
  date,
  status: "STATUS_SCHEDULED",
  is_final: false,
  home_team_name: NYY,
  visitor_team_name: BAL,
  ...extra,
});

// mlb_games as the sync found them at 00:05 UTC Sep 25
const fri = row("espn_mlb_401817073", "2026-09-25T23:05:00+00:00"); // Friday night, now game 2
const sat = row("espn_mlb_401817088", "2026-09-26T23:15:00+00:00"); // moved to Friday game 1
const sun = row("espn_mlb_401817103", "2026-09-27T19:20:00+00:00");

const side = (id: number, name: string) => ({ id, name, score: null, probable: null });
const mlbGame = (gamePk: number, gameDate: string, gameNumber: number, extra: Partial<MlbScheduleGame> = {}): MlbScheduleGame => ({
  gamePk,
  gameDate,
  officialDate: "2026-09-25",
  scheduleDay: "2026-09-25",
  isPlaceholder: false,
  startTimeTBD: false,
  gameNumber,
  gameType: "R",
  detailedState: "Scheduled",
  state: "pre",
  status: "STATUS_SCHEDULED",
  isFinal: false,
  venue: "Yankee Stadium",
  weather: null,
  away: side(110, BAL),
  home: side(147, NYY),
  ...extra,
});
// statsapi's Friday: game 1 has a time, game 2 a placeholder 5 minutes later
const game1 = mlbGame(823489, "2026-09-25T20:05:00Z", 1);
const game2 = mlbGame(823491, "2026-09-25T20:10:00Z", 2, { startTimeTBD: true });

const t = (iso: string) => Date.parse(iso);

describe("pairGames: doubleheaders", () => {
  it("pairs equal counts in start order", () => {
    const moved = { ...sat, date: "2026-09-25T20:05Z" };
    const pairs = pairGames([game1, game2], [moved, fri], (g) => t(g.gameDate), (r) => t(r.date));
    expect(pairs.get(game1)).toBe(moved);
    expect(pairs.get(game2)).toBe(fri);
  });

  it("gives ESPN's only Friday row (game 2, 7:05 PM) to game 2, not to game 1 because it is listed first", () => {
    // game 1 is 3h from that row, game 2's placeholder 2h55m
    const pairs = pairGames([game1, game2], [fri], (g) => t(g.gameDate), (r) => t(r.date));
    expect(pairs.get(game2)).toBe(fri);
    expect(pairs.has(game1)).toBe(false);
  });

  it("never pairs games more than 3 hours apart", () => {
    const late = row("espn_mlb_1", "2026-09-25T23:35:00+00:00");
    const later = row("espn_mlb_5", "2026-09-26T00:05:00+00:00");
    expect(pairGames([game1], [late, later], (g) => t(g.gameDate), (r) => t(r.date)).size).toBe(0);
  });
});

describe("strandedRows: games that left their date", () => {
  const base = {
    fromDay: "2026-09-24",
    toDay: "2026-09-28",
    servedDays: new Set(["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"]),
    listedIds: new Set(["401817073", "401817103"]),
    mlbKeys: new Set([matchupKey("2026-09-25", BAL, NYY), matchupKey("2026-09-27", BAL, NYY)]),
  };

  it("finds the Saturday row the scoreboard no longer lists, and only it", () => {
    expect(strandedRows([fri, sat, sun], base)).toEqual([sat]);
  });

  it("finds nothing when ESPN lists every game (the normal case)", () => {
    expect(strandedRows([fri, sat, sun], { ...base, listedIds: new Set(["401817073", "401817088", "401817103"]) })).toEqual([]);
  });

  it("leaves finals, past days, days past the window and statsapi-sourced rows alone", () => {
    const final = row("espn_mlb_2", "2026-09-25T17:05:00+00:00", { is_final: true, status: "STATUS_FINAL" });
    const past = row("espn_mlb_3", "2026-09-23T23:05:00+00:00");
    const later = row("espn_mlb_4", "2026-09-29T23:05:00+00:00");
    const mlbapi = row("mlbapi_823489", "2026-09-26T23:15:00+00:00");
    expect(strandedRows([final, past, later, mlbapi], base)).toEqual([]);
  });

  it("on a day ESPN could not serve, flags only a row MLB has no game for", () => {
    const failedSat = { ...base, servedDays: new Set(["2026-09-25", "2026-09-27"]) };
    expect(strandedRows([sat], failedSat)).toEqual([sat]);
    expect(strandedRows([sat], { ...failedSat, mlbKeys: new Set([matchupKey("2026-09-26", BAL, NYY)]) })).toEqual([]);
    expect(strandedRows([sat], { ...failedSat, mlbKeys: null })).toEqual([]); // MLB unreachable: no evidence
  });

  it("reads the ESPN event id off the row", () => {
    expect(espnEventId("espn_mlb_401817088")).toBe("401817088");
    expect(espnEventId("mlbapi_823489")).toBeNull();
    expect(espnEventId(null)).toBeNull();
  });
});

describe("planStranded: what to write", () => {
  it("moves the row to the date ESPN's core API has now (Friday 4:05 PM ET)", () => {
    expect(planStranded(sat, { date: "2026-09-25T20:05Z", status: "STATUS_SCHEDULED" }, false)).toEqual({ date: "2026-09-25T20:05Z" });
  });

  it("takes a postponed or canceled status ESPN gives the game where it stands", () => {
    expect(planStranded(fri, { date: "2026-09-25T23:05Z", status: "STATUS_POSTPONED" }, true)).toEqual({ status: "STATUS_POSTPONED" });
    expect(planStranded(fri, { date: "2026-09-25T23:05Z", status: "STATUS_CANCELED" }, false)).toEqual({ status: "STATUS_CANCELED" });
  });

  it("changes nothing when ESPN still has the game where we do", () => {
    expect(planStranded(fri, { date: "2026-09-25T23:05Z", status: "STATUS_SCHEDULED" }, true)).toBeNull();
    // ESPN's first pitch a few minutes off the stored (MLB) time is not a move
    expect(planStranded(fri, { date: "2026-09-25T23:00Z", status: "STATUS_SCHEDULED" }, true)).toBeNull();
    // ...but hours on the same day is
    expect(planStranded(fri, { date: "2026-09-25T17:05Z", status: "STATUS_SCHEDULED" }, true)).toEqual({ date: "2026-09-25T17:05Z" });
  });

  it("marks the game postponed (hidden, not deleted) when neither ESPN nor MLB has it on that date", () => {
    expect(planStranded(sat, "missing", false)).toEqual({ status: "STATUS_POSTPONED" });
    expect(planStranded(sat, "missing", null)).toEqual({ status: "STATUS_POSTPONED" });
    expect(planStranded(sat, null, false)).toEqual({ status: "STATUS_POSTPONED" }); // ESPN unreachable, MLB says no game
    expect(isCalledOffStatus("STATUS_POSTPONED")).toBe(true);
  });

  it("leaves the row when MLB still lists the game that day, or nothing can be checked", () => {
    expect(planStranded(sat, "missing", true)).toBeNull();
    expect(planStranded(sat, null, true)).toBeNull();
    expect(planStranded(sat, null, null)).toBeNull();
  });

  it("writes nothing twice, and a later move un-hides a row it marked", () => {
    const marked = { ...sat, status: "STATUS_POSTPONED" };
    expect(planStranded(marked, "missing", false)).toBeNull();
    // ESPN still where we are and scheduled: MLB had no game there, so it stays hidden
    expect(planStranded(marked, { date: sat.date, status: "STATUS_SCHEDULED" }, false)).toBeNull();
    expect(planStranded(marked, { date: "2026-09-25T20:05Z", status: "STATUS_SCHEDULED" }, true)).toEqual({
      date: "2026-09-25T20:05Z",
      status: "STATUS_SCHEDULED",
    });
  });

  it("moves a mirror listing still on its old day, and never hides one (MLB check skipped)", () => {
    const listing = { date: "2026-09-26T23:15Z", status: "STATUS_SCHEDULED" };
    expect(planStranded(listing, { date: "2026-09-25T20:05Z", status: "STATUS_SCHEDULED" }, true)).toEqual({ date: "2026-09-25T20:05Z" });
    expect(planStranded(listing, "missing", true)).toBeNull();
  });

  it("leaves Friday with game 1 at 4:05 PM and game 2 at 7:05 PM, and Saturday empty", () => {
    const stranded = strandedRows([fri, sat, sun], {
      fromDay: "2026-09-24",
      toDay: "2026-09-28",
      servedDays: new Set(["2026-09-25", "2026-09-26", "2026-09-27"]),
      listedIds: new Set(["401817073", "401817103"]),
      mlbKeys: new Set([matchupKey("2026-09-25", BAL, NYY), matchupKey("2026-09-27", BAL, NYY)]),
    });
    const after = [fri, sat, sun].map((r) => {
      const fix = stranded.includes(r) ? planStranded(r, { date: "2026-09-25T20:05Z", status: "STATUS_SCHEDULED" }, false) : null;
      return { ...r, ...fix };
    });
    const friday = after.filter((r) => r.date.startsWith("2026-09-25")).sort((a, b) => t(a.date) - t(b.date));
    expect(friday.map((r) => [r.external_id, r.date])).toEqual([
      ["espn_mlb_401817088", "2026-09-25T20:05Z"],
      ["espn_mlb_401817073", "2026-09-25T23:05:00+00:00"],
    ]);
    expect(after.filter((r) => r.date.startsWith("2026-09-26"))).toEqual([]);
    // MLB's game 1 now pairs with the moved row and game 2 with the night game
    const pairs = pairGames([game1, game2], friday, (g) => t(g.gameDate), (r) => t(r.date));
    expect(pairs.get(game1)?.external_id).toBe("espn_mlb_401817088");
    expect(pairs.get(game2)?.external_id).toBe("espn_mlb_401817073");
  });
});

describe("matchProjectionRows: doubleheader projections", () => {
  const proj = (date: string, home: string) => ({
    date,
    visitor_team_name: BAL,
    home_team_name: NYY,
    starting_pitcher_away: "Brandon Young",
    starting_pitcher_home: home,
  });

  it("does not give game 1 the projected starter stored on game 2's row", () => {
    // Before the fix the chat read game 1 as "@ Yankees (Will Warren, projected)"
    const warren = proj("2026-09-25T23:05:00+00:00", "Will Warren");
    const map = matchProjectionRows([game1, game2], [warren]);
    expect(map.get(823491)).toBe(warren);
    expect(map.has(823489)).toBe(false);
  });

  it("pairs each game with its own row once both are on Friday", () => {
    const rodon = proj("2026-09-25T20:05Z", "Carlos Rodon");
    const warren = proj("2026-09-25T23:05:00+00:00", "Will Warren");
    const map = matchProjectionRows([game1, game2], [warren, rodon]);
    expect(map.get(823489)).toBe(rodon);
    expect(map.get(823491)).toBe(warren);
  });
});

describe("isCalledOffStatus", () => {
  it("is true for postponed and canceled games only", () => {
    expect(isCalledOffStatus("STATUS_POSTPONED")).toBe(true);
    expect(isCalledOffStatus("STATUS_CANCELED")).toBe(true);
    expect(isCalledOffStatus("Cancelled")).toBe(true);
    expect(isCalledOffStatus("STATUS_SCHEDULED")).toBe(false);
    expect(isCalledOffStatus("STATUS_SUSPENDED")).toBe(false);
    expect(isCalledOffStatus("STATUS_FINAL")).toBe(false);
    expect(isCalledOffStatus(null)).toBe(false);
  });
});
