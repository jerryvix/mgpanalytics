import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  kickoffToUtc,
  parseAmericanPrice,
  parseDkSplitsPage,
  parseKickoffLabel,
  SplitsMarkupError,
} from "../../supabase/functions/sync-betting-splits/parse";

// Fixtures are trimmed captures of the DK Network betting-splits page
// (Sep 24 2026 06:05 UTC, Week 4): the splits container and pagination bar
// only, indentation collapsed, tags/classes/text unchanged.
const fixture = (name: string) => readFileSync(resolve(__dirname, "fixtures", name), "utf-8");
const ncaafP1 = fixture("dk-splits-ncaaf-2026-09-24-p1.html");
const ncaafP5 = fixture("dk-splits-ncaaf-2026-09-24-p5.html");
const nflP1 = fixture("dk-splits-nfl-2026-09-24-p1.html");

describe("parseDkSplitsPage", () => {
  const p1 = parseDkSplitsPage(ncaafP1);
  const p5 = parseDkSplitsPage(ncaafP5);

  it("reads every event block on a page and the pagination state", () => {
    expect(p1.events).toHaveLength(10);
    expect(p1.skipped).toEqual([]);
    expect(p1.empty).toBe(false);
    expect(p1.hasNext).toBe(true);
    // Last page: "Next" is a dead href="#" link
    expect(p5.events).toHaveLength(10);
    expect(p5.hasNext).toBe(false);
  });

  it("extracts one event field by field, sides resolved from labels not row order", () => {
    // DK lists the moneyline home-first and the spread favorite-first here
    expect(p1.events[0]).toEqual({
      eventId: "34674727",
      away: "Liberty",
      home: "Coastal Carolina",
      kickoffLabel: "9/24, 07:30PM",
      kickoff: { month: 9, day: 24, hour: 19, minute: 30 },
      markets: {
        moneyline: [
          { side: "away", label: "Liberty", line: null, price: -135, handlePct: 88, betsPct: 58 },
          { side: "home", label: "Coastal Carolina", line: null, price: 114, handlePct: 12, betsPct: 42 },
        ],
        spread: [
          { side: "away", label: "Liberty -2.5", line: -2.5, price: -112, handlePct: 90, betsPct: 79 },
          { side: "home", label: "Coastal Carolina +2.5", line: 2.5, price: -108, handlePct: 10, betsPct: 21 },
        ],
        total: [
          { side: "over", label: "Over 50.5", line: 50.5, price: -105, handlePct: 55, betsPct: 50 },
          { side: "under", label: "Under 50.5", line: 50.5, price: -115, handlePct: 45, betsPct: 50 },
        ],
      },
    });
  });

  it("decodes entities in team names and keeps them identical in the labels", () => {
    const aggies = p5.events.find((e) => e.eventId === "34226054")!;
    expect(`${aggies.away} @ ${aggies.home}`).toBe("Texas A&M @ LSU");
    expect(aggies.markets.spread?.[0]).toMatchObject({ side: "away", label: "Texas A&M +8.5", line: 8.5 });
  });

  it("leaves markets DK does not post absent instead of inventing them", () => {
    const utep = p5.events.find((e) => e.home === "UTEP")!;
    expect(Object.keys(utep.markets).sort()).toEqual(["moneyline", "spread"]);
  });

  it("reads NFL titles that wrap team logos inside the link", () => {
    const nfl = parseDkSplitsPage(nflP1);
    expect(nfl.events).toHaveLength(10);
    expect(nfl.events[0]).toMatchObject({ eventId: "34118180", away: "ATL Falcons", home: "GB Packers" });
    expect(nfl.events[0].markets.spread).toEqual([
      { side: "away", label: "ATL Falcons +4.5", line: 4.5, price: -105, handlePct: 42, betsPct: 29 },
      { side: "home", label: "GB Packers -4.5", line: -4.5, price: -115, handlePct: 58, betsPct: 71 },
    ]);
  });

  it("recognizes DK's explicit empty state", () => {
    expect(parseDkSplitsPage(fixture("dk-splits-empty.html"))).toEqual({
      events: [],
      empty: true,
      hasNext: false,
      skipped: [],
    });
  });

  it("fails loudly when the page structure changes", () => {
    expect(() => parseDkSplitsPage("<html><body>redesigned page</body></html>")).toThrow(SplitsMarkupError);
    // Container present but no events and no empty-state message
    expect(() => parseDkSplitsPage('<div class="tbtw" id="tbsedid"><div class="wrap-for-export"></div></div>')).toThrow(
      SplitsMarkupError,
    );
    // Columns reordered: handle/bets would silently swap without the header
    // check. (The page also carries a commented-out legacy header; target a
    // live market header.)
    const reordered = ncaafP1.replace(
      /(<div class="flex-1">Spread<\/div>\s*<div class="flex-1">Odds<\/div>\s*)<div class="flex-1">% Handle<\/div>\s*<div class="flex-1">% Bets<\/div>/,
      '$1<div class="flex-1">% Bets</div>\n<div class="flex-1">% Handle</div>',
    );
    expect(reordered).not.toBe(ncaafP1);
    expect(() => parseDkSplitsPage(reordered)).toThrow(/market header/);
  });

  it("drops (and reports) a single malformed event rather than guessing", () => {
    const renamed = ncaafP1.replace(
      '<div class="tb-slipline flex-1 font-medium">Liberty -2.5</div>',
      '<div class="tb-slipline flex-1 font-medium">Flames -2.5</div>',
    );
    const page = parseDkSplitsPage(renamed);
    expect(page.events).toHaveLength(9);
    expect(page.skipped).toHaveLength(1);
    expect(page.skipped[0]).toMatch(/Liberty @ Coastal Carolina: spread label "Flames -2.5" names neither/);
  });
});

describe("parseAmericanPrice", () => {
  it("reads DK's typographic minus, plus signs and EVEN", () => {
    expect(parseAmericanPrice("−135")).toBe(-135);
    expect(parseAmericanPrice(" +114 ")).toBe(114);
    expect(parseAmericanPrice("EVEN")).toBe(100);
    expect(parseAmericanPrice("")).toBeNull();
  });

  it("rejects anything that is not a legal American price", () => {
    expect(() => parseAmericanPrice("1.91")).toThrow();
    expect(() => parseAmericanPrice("50")).toThrow();
  });
});

describe("kickoff times", () => {
  it("parses DK's Eastern wall clock", () => {
    expect(parseKickoffLabel("9/26, 12:00PM")).toEqual({ month: 9, day: 26, hour: 12, minute: 0 });
    expect(parseKickoffLabel("9/25, 10:30PM")).toEqual({ month: 9, day: 25, hour: 22, minute: 30 });
    expect(parseKickoffLabel("9/27, 12:15AM")).toEqual({ month: 9, day: 27, hour: 0, minute: 15 });
    expect(() => parseKickoffLabel("TBD")).toThrow();
  });

  it("converts to UTC across daylight saving and the new year", () => {
    const sep = new Date("2026-09-24T06:00:00Z");
    expect(kickoffToUtc({ month: 9, day: 24, hour: 19, minute: 30 }, sep).toISOString()).toBe("2026-09-24T23:30:00.000Z");
    const nov = new Date("2026-11-20T12:00:00Z");
    expect(kickoffToUtc({ month: 11, day: 28, hour: 12, minute: 0 }, nov).toISOString()).toBe("2026-11-28T17:00:00.000Z");
    // A New Year's bowl listed in late December belongs to the next year
    const dec = new Date("2026-12-28T12:00:00Z");
    expect(kickoffToUtc({ month: 1, day: 1, hour: 20, minute: 0 }, dec).toISOString()).toBe("2027-01-02T01:00:00.000Z");
  });
});
