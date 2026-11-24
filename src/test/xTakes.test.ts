import { describe, expect, it } from "vitest";
import {
  gameIsMatchable,
  MATCH_BOTH,
  MATCH_ONE,
  matchToGame,
  type UpcomingGame,
} from "../../supabase/functions/ingest-takes/games";
import { prepareXBatch } from "../../supabase/functions/ingest-x-takes/accept";
import { secretMatches } from "../../supabase/functions/ingest-x-takes/auth";
import { namesMatch, noteForTeams, type MarketNoteRow } from "@/lib/marketNotes";
import { sharedUnits, withUnits } from "@/lib/takes";

const NOW = new Date("2026-11-24T18:00:00Z");
const MINUS = String.fromCharCode(0x2212);

function game(over: Partial<UpcomingGame> & Pick<UpcomingGame, "id" | "awayWords" | "homeWords" | "awayName" | "homeName">): UpcomingGame {
  return {
    sport: "NFL",
    startsAt: "2026-11-25T01:15:00.000Z",
    matchup: "Bengals at Commanders",
    teams: [...over.awayWords, ...over.homeWords],
    teamIds: ["4", "28"],
    line: "",
    state: "pre",
    ...over,
  };
}

const commanders = game({
  id: "401772941",
  awayWords: ["cincinnati bengals", "bengals", "cincinnati"],
  homeWords: ["washington commanders", "commanders", "washington"],
  awayName: "Cincinnati Bengals",
  homeName: "Washington Commanders",
});

const lsu = game({
  id: "lsu",
  sport: "NCAAF",
  matchup: "LSU at Georgia",
  startsAt: "2026-11-29T01:00:00.000Z",
  awayWords: ["lsu tigers", "lsu", "tigers"],
  homeWords: ["georgia bulldogs", "georgia", "bulldogs"],
  awayName: "LSU Tigers",
  homeName: "Georgia Bulldogs",
});

const clemson = game({
  id: "clemson",
  sport: "NCAAF",
  matchup: "Clemson at Florida State",
  startsAt: "2026-11-29T01:00:00.000Z",
  awayWords: ["clemson tigers", "clemson", "tigers"],
  homeWords: ["florida state seminoles", "florida state", "seminoles"],
  awayName: "Clemson Tigers",
  homeName: "Florida State Seminoles",
});

const pick = {
  post_id: "1234567890",
  url: "https://x.com/BookitWithTrent/status/1234567890",
  handle: "@BookitWithTrent",
  author: "Trent Attyah",
  posted_at: "2026-11-24T15:00:00Z",
  kind: "pick",
  sport: "NFL",
  text: `Commanders +6.5 (5u)`,
  matchup: "Bengals at Commanders",
  market: "spread",
  pick: `Commanders +6.5`,
  price: "-110",
  units: "5u",
  why: "Rested",
};

const note = {
  post_id: "9876543210",
  url: "https://x.com/johnewing/status/9876543210",
  handle: "johnewing",
  author: "John Ewing",
  posted_at: "2026-11-24T14:00:00Z",
  kind: "note",
  sport: "NFL",
  text: "Bengals opened -4 now -6.5, 75% of bets / 55% of money on Bengals",
  matchup: "Bengals at Commanders",
  market: "spread",
};

describe("game matcher", () => {
  it("keeps games that have not started, and in-progress games only when asked", () => {
    const future = "2026-11-25T01:15:00Z";
    const past = "2026-11-24T17:00:00Z";
    expect(gameIsMatchable("pre", future, NOW, false)).toBe(true);
    expect(gameIsMatchable("pre", past, NOW, false)).toBe(false);
    expect(gameIsMatchable("in", past, NOW, false)).toBe(false);
    expect(gameIsMatchable("in", past, NOW, true)).toBe(true);
    expect(gameIsMatchable("post", past, NOW, true)).toBe(false);
  });

  it("matches both team names, and a single distinctive name when only one game has it", () => {
    expect(matchToGame([commanders], { sport: "NFL", text: "Bengals at Commanders" })).toMatchObject({
      ok: true, confidence: MATCH_BOTH, game: { id: commanders.id },
    });
    expect(matchToGame([commanders], { sport: "NFL", text: "Commanders +6.5" })).toMatchObject({
      ok: true, confidence: MATCH_ONE,
    });
  });

  it("drops a shared nickname and keeps the longer school name", () => {
    const games = [lsu, clemson];
    expect(matchToGame(games, { sport: "NCAAF", text: "Tigers -3" })).toEqual({
      ok: false, reason: "matched more than one game",
    });
    expect(matchToGame(games, { sport: "NCAAF", text: "LSU Tigers -3" })).toMatchObject({
      ok: true, game: { id: "lsu" },
    });
  });

  it("does not use a game from another sport or a final that was left out of the list", () => {
    expect(matchToGame([commanders], { sport: "NBA", text: "Bengals at Commanders" }).ok).toBe(false);
    const live = { ...commanders, state: "in" as const };
    expect(matchToGame([live], { sport: "NFL", text: "Bengals at Commanders" }).ok).toBe(true);
  });
});

describe("prepareXBatch", () => {
  const games = [commanders, lsu, clemson];

  it("stores a pick and a note, with credit from the registry and a link", () => {
    const out = prepareXBatch([pick, note], games, NOW);
    expect(out.picks).toHaveLength(1);
    expect(out.notes).toHaveLength(1);
    expect(out.picks[0]).toMatchObject({
      source: "x",
      show: "bookit-with-trent",
      show_name: "BookitWithTrent",
      person: "Trent Attyah",
      external_id: "1234567890",
      episode_guid: "1234567890",
      url: pick.url,
      pick: "Commanders +6.5",
      price: "-110",
      units: 5,
      espn_event_id: commanders.id,
      match_confidence: MATCH_BOTH,
    });
    expect(out.notes[0]).toMatchObject({
      source: "x",
      handle: "johnewing",
      credit: "John Ewing, BetMGM",
      author_name: "John Ewing",
      body: note.text,
      post_id: note.post_id,
      url: note.url,
      espn_event_id: commanders.id,
    });
    expect(out.results.map((r) => r.status)).toEqual(["stored", "stored"]);
    expect(out.picks.some((p) => p.pick.includes(note.text))).toBe(false);
  });

  it("is idempotent on post id plus pick, and refuses a pick from the notes account", () => {
    const again = prepareXBatch([pick, { ...pick, why: "Updated" }], games, NOW);
    expect(again.picks).toHaveLength(1);
    expect(again.picks[0].why).toBe("Updated");
    expect(again.results.map((r) => r.status)).toEqual(["duplicate", "stored"]);

    const refused = prepareXBatch([{ ...note, kind: "pick", pick: "Bengals -6.5" }], games, NOW);
    expect(refused.picks).toHaveLength(0);
    expect(refused.notes).toHaveLength(0);
    expect(refused.results[0]).toMatchObject({ status: "rejected", reason: "this account files notes, not picks" });
  });

  it("flags a post that does not match one upcoming or in-progress game", () => {
    const out = prepareXBatch([{
      ...pick,
      post_id: "555",
      text: "Tigers -3",
      matchup: "",
      pick: "Tigers -3",
      sport: "NCAAF",
    }], games, NOW);
    expect(out.picks).toHaveLength(0);
    expect(out.results[0]).toMatchObject({ status: "unmatched", reason: "matched more than one game" });
  });

  it("rejects a missing secret, a bad url, and a typographic minus in the pick", () => {
    expect(secretMatches(null, "abc")).toBe(false);
    expect(secretMatches("abc", "")).toBe(false);
    expect(secretMatches("abc", "abd")).toBe(false);
    expect(secretMatches("abc", "abc")).toBe(true);

    const badUrl = prepareXBatch([{ ...pick, url: "javascript:alert(1)" }], games, NOW);
    expect(badUrl.results[0].status).toBe("rejected");

    const dashed = prepareXBatch([{ ...pick, post_id: "777", pick: `Commanders ${MINUS}6.5` }], games, NOW);
    expect(dashed.picks[0].pick).toBe("Commanders -6.5");
  });
});

describe("market note matching", () => {
  const row: MarketNoteRow = {
    id: "n1",
    sport: "NFL",
    away_name: "Cincinnati Bengals",
    home_name: "Washington Commanders",
    credit: "John Ewing, BetMGM",
    body: note.text,
    url: note.url,
    starts_at: commanders.startsAt,
  };

  it("matches a nickname to the full ESPN name and not a shorter school to a longer one", () => {
    expect(namesMatch("Bengals", "Cincinnati Bengals")).toBe(true);
    expect(namesMatch("Ohio", "Ohio State Buckeyes")).toBe(false);
    expect(namesMatch("Ohio State", "Ohio State Buckeyes")).toBe(true);
    expect(noteForTeams([row], "Washington Commanders", "Cincinnati Bengals")).toHaveLength(1);
    expect(noteForTeams([row], "Kansas City Chiefs", "Buffalo Bills")).toHaveLength(0);
  });

  it("adds a stake only when the grouped pick agrees on one", () => {
    expect(withUnits("Commanders +6.5 (-110)", 5)).toBe("Commanders +6.5 (-110) · 5u");
    expect(sharedUnits([{ units: 5 }, { units: 2 }])).toBeNull();
  });
});
