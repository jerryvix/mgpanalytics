import { describe, it, expect, vi } from "vitest";
import {
  coreEventDate,
  coreLookupIds,
  espnEventId,
  freshCoreUrl,
  hasPlaceholderTeam,
  indexMlbSchedule,
  isPlaceholderListing,
  isStorableMlbGame,
  listingsToStore,
  mlbLists,
  pairGames,
  planListing,
  planStranded,
  strandedRows,
  unconfirmedListings,
  type Listing,
  type SyncRow,
} from "../../supabase/functions/sync-mlb-games/reconcile";
import { expectedStart, matchProjectionRows, type MlbScheduleGame, type ProbableMatchup } from "../../supabase/functions/_shared/mlb-statsapi";
import { findMatchupForGame } from "@/services/mlb/probablePitchers";
import { isCalledOffStatus } from "@/lib/gameStatus";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

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
  officialDate: gameDate.slice(0, 10),
  scheduleDay: gameDate.slice(0, 10),
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
const sunday = mlbGame(823490, "2026-09-27T19:20:00Z", 1);
// Saturday's other games (MLB lists 14 that day), none of them Orioles @ Yankees
const saturdayOther = mlbGame(823999, "2026-09-26T23:05:00Z", 1, { away: side(141, "Toronto Blue Jays"), home: side(139, "Tampa Bay Rays") });

const t = (iso: string) => Date.parse(iso);
const rowTime = (r: { date: string }) => t(r.date);

// Every served day of the forward pass at 00:05 UTC Sep 25
const served = new Set(["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"]);
const mlb = indexMlbSchedule([game1, game2, sunday, saturdayOther]);
const window = { fromDay: "2026-09-24", toDay: "2026-09-28" };

describe("pairGames: doubleheaders", () => {
  it("pairs equal counts in start order", () => {
    const moved = { ...sat, date: "2026-09-25T20:05Z" };
    const pairs = pairGames([game1, game2], [moved, fri], expectedStart, rowTime);
    expect(pairs.get(game1)).toBe(moved);
    expect(pairs.get(game2)).toBe(fri);
  });

  it("gives ESPN's only Friday row (game 2, 7:05 PM) to game 2, not to game 1 because it is listed first", () => {
    const pairs = pairGames([game1, game2], [fri], expectedStart, rowTime);
    expect(pairs.get(game2)).toBe(fri);
    expect(pairs.has(game1)).toBe(false);
  });

  it("never pairs games more than 3 hours apart", () => {
    const late = row("espn_mlb_1", "2026-09-25T23:35:00+00:00");
    const later = row("espn_mlb_5", "2026-09-26T00:05:00+00:00");
    expect(pairGames([game1], [late, later], expectedStart, rowTime).size).toBe(0);
  });
});

// QC round 2: game 2's TBD placeholder (game 1 plus five minutes) won the
// closest-time contest and swapped both games.
describe("doubleheader game 2 with no time set: the placeholder never outbids game 1", () => {
  const g1 = mlbGame(900001, "2026-09-25T17:05:00Z", 1);
  const g2 = mlbGame(900002, "2026-09-25T17:10:00Z", 2, { startTimeTBD: true });
  const r1 = row("espn_mlb_900001", "2026-09-25T17:10:00+00:00"); // game 1's row
  const r2 = row("espn_mlb_900002", "2026-09-25T20:35:00+00:00"); // game 2's row
  const proj = (r: SyncRow, home: string) => ({ ...r, starting_pitcher_home: home, starting_pitcher_away: null });

  it("expects game 2 about 3h20m after its placeholder (MLB started such games 3h01m to 3h51m after game 1)", () => {
    expect(expectedStart(g2) - t(g2.gameDate)).toBe(200 * 60_000);
    expect(expectedStart(g1)).toBe(t(g1.gameDate));
    expect(expectedStart({ ...g1, startTimeTBD: true })).toBe(t(g1.gameDate)); // a single game with no time is not a game 2
  });

  it("matchProjectionRows: rows at 17:10 and 20:35 go to game 1 and game 2", () => {
    const p1 = proj(r1, "Game One Starter");
    const p2 = proj(r2, "Game Two Starter");
    const map = matchProjectionRows([g1, g2], [p1, p2]);
    expect(map.get(900001)).toBe(p1);
    expect(map.get(900002)).toBe(p2);
  });

  it("pairGames: with one row missing, each row still goes to its own game", () => {
    expect(pairGames([g1, g2], [r1], expectedStart, rowTime).get(g1)).toBe(r1);
    expect(pairGames([g1, g2], [r1], expectedStart, rowTime).has(g2)).toBe(false);
    expect(pairGames([g1, g2], [r2], expectedStart, rowTime).get(g2)).toBe(r2);
  });

  it("findMatchupForGame: each slate row gets its own game's starters", () => {
    const matchups: ProbableMatchup[] = [g1, g2].map((game) => ({ game, away: null, home: null }));
    expect(findMatchupForGame(matchups, r1)?.game.gamePk).toBe(900001);
    expect(findMatchupForGame(matchups, r2)?.game.gamePk).toBe(900002);
  });
});

describe("MLB's schedule as evidence", () => {
  it("knows which matchups MLB lists on which days", () => {
    expect(mlbLists(mlb, "2026-09-25", BAL, NYY)).toBe(true);
    expect(mlbLists(mlb, "2026-09-26", BAL, NYY)).toBe(false); // MLB plays Saturday, not this game
  });

  it("says nothing in spring training, when MLB lists no counted games (QC round 2)", () => {
    const spring = indexMlbSchedule([mlbGame(700001, "2026-03-10T17:05:00Z", 1, { gameType: "S" })]);
    expect(spring.days.size).toBe(0);
    expect(mlbLists(spring, "2026-03-10", BAL, NYY)).toBeNull();
    expect(mlbLists(indexMlbSchedule([]), "2026-09-26", BAL, NYY)).toBeNull(); // statsapi unreachable
  });

  it("with no evidence, a failed day's rows are neither stranded nor marked postponed", () => {
    const spring = indexMlbSchedule([mlbGame(700001, "2026-03-10T17:05:00Z", 1, { gameType: "S" })]);
    const springRow = row("espn_mlb_700001", "2026-03-10T17:05:00+00:00");
    const opts = { fromDay: "2026-03-10", toDay: "2026-03-14", servedDays: new Set<string>(), listedIds: new Set<string>(), mlb: spring };
    expect(strandedRows([springRow], opts)).toEqual([]);
    // ...and even a stranded row is left alone when ESPN is down too
    expect(planStranded(springRow, null, mlbLists(spring, "2026-03-10", BAL, NYY))).toBeNull();
  });
});

describe("strandedRows: games that left their date", () => {
  const base = { ...window, servedDays: served, listedIds: new Set(["401817073", "401817103"]), mlb };

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

  it("on a day ESPN could not serve, flags only a row MLB positively does not list", () => {
    const failedSat = { ...base, servedDays: new Set(["2026-09-25", "2026-09-27"]) };
    expect(strandedRows([sat], failedSat)).toEqual([sat]);
    const withSat = indexMlbSchedule([game1, game2, sunday, mlbGame(823488, "2026-09-26T23:15:00Z", 1)]);
    expect(strandedRows([sat], { ...failedSat, mlb: withSat })).toEqual([]);
    expect(strandedRows([sat], { ...failedSat, mlb: indexMlbSchedule([]) })).toEqual([]); // MLB unreachable: no evidence
  });

  it("reads the ESPN event id off the row", () => {
    expect(espnEventId("espn_mlb_401817088")).toBe("401817088");
    expect(espnEventId("mlbapi_823489")).toBeNull();
    expect(espnEventId(null)).toBeNull();
  });
});

// ESPN's scoreboard mirror for Sep 29 - Oct 1 2026, as served on Sep 25: every
// Wild Card game is a placeholder (ids 401907896...), some with one side known
const placeholder = (id: string, day: string, home: [string, string], note: string): Listing & { note: string } => ({
  id,
  date: `${day}T04:00Z`,
  note,
  status: { type: { name: "STATUS_SCHEDULED", state: "pre" } },
  competitions: [{
    timeValid: false,
    competitors: [
      { team: { id: home[0], displayName: home[1] } },
      { team: { id: "-2", displayName: "TBD" } },
    ],
  }],
});
const wildCard: Array<Listing & { note: string }> = [];
for (const [day, ids] of [
  ["2026-09-29", ["401907896", "401907924", "401907965", "401907974"]],
  ["2026-09-30", ["401907897", "401907963", "401907972", "401907975"]],
  ["2026-10-01", ["401907898", "401907964", "401907973", "401907976"]],
] as const) {
  ids.forEach((id, i) => wildCard.push(placeholder(id, day, i === 1 ? ["10", NYY] : ["-1", "TBD"], "Wild Card")));
}
// MLB lists the same slots its own way, so none pairs
const mlbPostseason = indexMlbSchedule(
  ["2026-09-29", "2026-09-30", "2026-10-01"].map((day, i) =>
    mlbGame(849851 - i, `${day}T07:33:00Z`, 1, { gameType: "F", startTimeTBD: true, away: side(0, "AL Wild Card #2") }),
  ),
);
const regular = (id: string, date: string): Listing => ({
  id,
  date,
  status: { type: { name: "STATUS_SCHEDULED", state: "pre" } },
  competitions: [{ competitors: [{ team: { id: "10", displayName: NYY } }, { team: { id: "1", displayName: BAL } }] }],
});

describe("ESPN's postseason placeholders (QC round 2)", () => {
  it("recognizes TBD sides and unset first pitches", () => {
    expect(wildCard.every(isPlaceholderListing)).toBe(true);
    expect(isPlaceholderListing(regular("401817088", "2026-09-26T23:15Z"))).toBe(false);
    const tbdTime = regular("401817099", "2026-09-26T04:00Z");
    tbdTime.competitions![0].timeValid = false;
    expect(isPlaceholderListing(tbdTime)).toBe(true);
  });

  it("cost zero core lookups on Sep 27, when all twelve Wild Card slots are in the window", () => {
    // MLB does list games on those days, and none pairs: only the placeholder rule keeps them out
    expect(["2026-09-29", "2026-09-30", "2026-10-01"].every((d) => mlbPostseason.days.has(d))).toBe(true);
    const unconfirmed = unconfirmedListings(wildCard, { fromDay: "2026-09-27", toDay: "2026-10-01", hasTwin: () => false, mlb: mlbPostseason });
    expect(unconfirmed).toEqual([]);
    expect(coreLookupIds([], unconfirmed, 12)).toEqual([]);
  });

  it("still checks a real listing MLB does not confirm, and puts stranded rows first", () => {
    const stale = regular("401817088", "2026-09-26T23:15Z");
    const unconfirmed = unconfirmedListings([...wildCard, stale], { ...window, hasTwin: () => false, mlb });
    expect(unconfirmed).toEqual([stale]);
    expect(coreLookupIds([fri], unconfirmed, 12)).toEqual(["401817073", "401817088"]);
    expect(coreLookupIds([fri], unconfirmed, 1)).toEqual(["401817073"]);
  });

  it("skips listings MLB has nothing to say about (no counted games that day)", () => {
    const offDay = regular("401817111", "2026-09-28T23:05Z");
    expect(unconfirmedListings([offDay], { ...window, hasTwin: () => false, mlb })).toEqual([]);
  });
});

// The lead's call (Sep 25 2026): ESPN's slots with a TBD side are not stored,
// so no "TBD @ TBD" card or chat line. They enter the sync window at 04:00Z
// Sep 25. Only the teams decide it: a real game with no time yet is stored.
describe("storing ESPN's postseason placeholders", () => {
  it("does not store a TBD @ TBD listing, or one with a single team set", () => {
    const tbdAtTbd = wildCard.find((e) => e.id === "401907896")!; // ALWC Game 1
    const tbdAtNyy = wildCard.find((e) => e.id === "401907964")!; // ALWC Game 3, TBD at New York Yankees
    expect(listingsToStore([tbdAtTbd])).toEqual([]);
    expect(listingsToStore([tbdAtNyy])).toEqual([]);
    expect(listingsToStore(wildCard)).toEqual([]);
  });

  it("stores a real doubleheader game 2 whose first pitch is not set (timeValid false)", () => {
    const game2Listing = regular("401817073", "2026-09-25T20:10Z");
    game2Listing.competitions![0].timeValid = false;
    expect(listingsToStore([game2Listing])).toEqual([game2Listing]);
    expect(hasPlaceholderTeam(game2Listing)).toBe(false);
    expect(isPlaceholderListing(game2Listing)).toBe(true); // stored, but still costs no core lookup
  });

  it("stores the slot under the same event id once ESPN names both teams", () => {
    const before = wildCard.find((e) => e.id === "401907964")!;
    const after: Listing = {
      ...before,
      competitions: [{
        timeValid: false,
        competitors: [{ team: { id: "10", displayName: NYY } }, { team: { id: "6", displayName: "Detroit Tigers" } }],
      }],
    };
    expect(listingsToStore([before])).toEqual([]);
    expect(listingsToStore([after]).map((e) => e.id)).toEqual(["401907964"]);
  });

  it("keeps the statsapi fallback from storing MLB's own slots on a day the mirror fails", () => {
    const awaySlot = mlbGame(849847, "2026-10-01T07:33:00Z", 1, { gameType: "F", startTimeTBD: true, away: side(4944, "AL Wild Card #2") });
    const bothSlots = mlbGame(849840, "2026-10-01T07:33:00Z", 1, {
      gameType: "F",
      away: side(4945, "NL Wild Card #2"),
      home: side(4619, "NL Wild Card #1"),
    });
    expect(isStorableMlbGame(awaySlot)).toBe(false);
    expect(isStorableMlbGame(bothSlots)).toBe(false);
  });

  // QC round 3: judged by names from stored rows, a run with ESPN down and no
  // rows stored refused every real game (all 614 in its replay)
  it("stores real clubs' games with no rows stored and no ESPN listing to learn names from", () => {
    const clubs: Array<[number, string]> = [[110, BAL], [147, NYY], [116, "Detroit Tigers"], [139, "Tampa Bay Rays"], [158, "Milwaukee Brewers"], [108, "Los Angeles Angels"]];
    const games = clubs.slice(1).map(([id, name], i) => mlbGame(900100 + i, "2026-09-26T23:05:00Z", 1, { away: side(clubs[i][0], clubs[i][1]), home: side(id, name) }));
    expect(games.every((g) => isStorableMlbGame(g))).toBe(true);
    expect(isStorableMlbGame(game1)).toBe(true);
  });
});

describe("ESPN's core API answers", () => {
  it("treats a missing or malformed date as unread, never a crash (QC round 2)", () => {
    expect(coreEventDate({ date: "2026-09-25T20:05Z" })).toBe("2026-09-25T20:05Z");
    expect(coreEventDate({ date: "" })).toBeNull();
    expect(coreEventDate({ date: "TBD" })).toBeNull();
    expect(coreEventDate({})).toBeNull();
    expect(coreEventDate(null)).toBeNull();
    // The QC repro: this threw a RangeError and failed the whole sync
    expect(planStranded(fri, { date: "", status: "STATUS_SCHEDULED" }, true)).toBeNull();
    // Unread plus MLB listing no such game still marks it, as with ESPN down
    expect(planStranded(sat, { date: "garbage", status: "STATUS_SCHEDULED" }, false)).toEqual({ status: "STATUS_POSTPONED" });
  });

  it("asks past the cache: a new mgpts every minute, https for http $refs", () => {
    const now = Date.parse("2026-09-25T01:27:41Z");
    expect(freshCoreUrl("https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/401817088", now)).toBe(
      "https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/401817088?mgpts=29838327",
    );
    expect(
      freshCoreUrl("http://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/401817088/competitions/401817088/status?lang=en&region=us", now),
    ).toBe("https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/401817088/competitions/401817088/status?lang=en&region=us&mgpts=29838327");
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

  it("leaves Friday with game 1 at 4:05 PM and game 2 at 7:05 PM, and Saturday empty", () => {
    const stranded = strandedRows([fri, sat, sun], {
      ...window,
      servedDays: new Set(["2026-09-25", "2026-09-26", "2026-09-27"]),
      listedIds: new Set(["401817073", "401817103"]),
      mlb,
    });
    const after = [fri, sat, sun].map((r) => {
      const fix = stranded.includes(r)
        ? planStranded(r, { date: "2026-09-25T20:05Z", status: "STATUS_SCHEDULED" }, mlbLists(mlb, "2026-09-26", BAL, NYY))
        : null;
      return { ...r, ...fix };
    });
    const friday = after.filter((r) => r.date.startsWith("2026-09-25")).sort((a, b) => t(a.date) - t(b.date));
    expect(friday.map((r) => [r.external_id, r.date])).toEqual([
      ["espn_mlb_401817088", "2026-09-25T20:05Z"],
      ["espn_mlb_401817073", "2026-09-25T23:05:00+00:00"],
    ]);
    expect(after.filter((r) => r.date.startsWith("2026-09-26"))).toEqual([]);
    // MLB's game 1 now pairs with the moved row and game 2 with the night game
    const pairs = pairGames([game1, game2], friday, expectedStart, rowTime);
    expect(pairs.get(game1)?.external_id).toBe("espn_mlb_401817088");
    expect(pairs.get(game2)?.external_id).toBe("espn_mlb_401817073");
  });
});

describe("planListing: a mirror listing MLB does not confirm", () => {
  // 23:36 UTC Sep 24: the mirror still listed the game on Saturday; core had Friday
  const staleListing = { date: "2026-09-26T23:15Z", status: "STATUS_SCHEDULED" };
  const coreFriday = { date: "2026-09-25T20:05Z", status: "STATUS_SCHEDULED" };
  // What the upsert writes for the listing this run
  const written = (listing: { date: string; status: string }, core: Parameters<typeof planListing>[1]) =>
    planListing(listing, core)?.date ?? listing.date;

  it("moves a listing still on its old day to ESPN's new date, and never hides one", () => {
    expect(planListing(staleListing, coreFriday)).toEqual({ date: "2026-09-25T20:05Z" });
    expect(planListing(staleListing, "missing")).toBeNull();
    expect(planListing(staleListing, null)).toBeNull();
  });

  // QC round 3: a stored-date guard read run 1's own write as a stale core copy,
  // so the runs wrote Friday, Saturday, Friday, Saturday...
  it("keeps Friday on three consecutive runs while the mirror still shows Saturday", () => {
    expect([1, 2, 3].map(() => written(staleListing, coreFriday))).toEqual(["2026-09-25T20:05Z", "2026-09-25T20:05Z", "2026-09-25T20:05Z"]);
  });

  it("keeps a game moved later on its new day while the mirror lists both days", () => {
    // Moved Tuesday to Wednesday and already stored Wednesday by a stranded fix; the
    // mirror lists it on both days and de-duplication keeps the stale Tuesday copy
    const tuesday = { date: "2026-09-29T23:05Z", status: "STATUS_SCHEDULED" };
    const coreWednesday = { date: "2026-09-30T17:05Z", status: "STATUS_SCHEDULED" };
    expect([1, 2, 3].map(() => written(tuesday, coreWednesday))).toEqual(["2026-09-30T17:05Z", "2026-09-30T17:05Z", "2026-09-30T17:05Z"]);
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
