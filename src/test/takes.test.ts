import { describe, expect, it } from "vitest";
import { creditLine, groupTakes, pickLabel, whenLabel, type TakeRow } from "@/lib/takes";

const base: TakeRow = {
  id: "1", show: "hold-the-phone", show_name: "Hold The Phone", person: null, sport: "NFL",
  espn_event_id: "e1", matchup: "Bengals at Commanders", starts_at: "2026-11-24T01:15:00Z",
  market: "spread", pick: "Commanders +6", price: "-107", legs: [], why: "Rested", risks: null,
};
const now = new Date("2026-11-23T20:00:00Z");

describe("groupTakes", () => {
  it("merges the same pick from two shows and orders games soonest first", () => {
    const rows: TakeRow[] = [
      base,
      { ...base, id: "2", show: "bear-bets", show_name: "Bear Bets", why: "Sell high on Cincinnati" },
      { ...base, id: "3", show: "early-edge", show_name: "SportsLine", pick: "Bengals -6", price: "-113" },
      { ...base, id: "4", show: "early-edge", show_name: "SportsLine", sport: "NBA", espn_event_id: "e0", matchup: "Cavaliers at Bulls", starts_at: "2026-11-24T01:00:00Z", market: "prop", pick: "Jarrett Allen U 15.5 Points", price: "-120" },
    ];
    const games = groupTakes(rows, now);
    expect(games.map((g) => g.matchup)).toEqual(["Cavaliers at Bulls", "Bengals at Commanders"]);
    const commanders = games[1].takes.find((t) => t.pick === "Commanders +6")!;
    expect(commanders.sources.map((s) => s.showName)).toEqual(["Hold The Phone", "Bear Bets"]);
    expect(creditLine(commanders.sources)).toBe("Hold The Phone, Bear Bets");
  });

  it("drops games that have started", () => {
    expect(groupTakes([base], new Date("2026-11-24T02:00:00Z"))).toEqual([]);
  });
});

describe("labels", () => {
  it("credits a named host with the show", () => {
    expect(creditLine([{ show: "early-edge", showName: "SportsLine", person: "Mike McClure", why: null, risks: null }])).toBe("Mike McClure · SportsLine");
  });
  it("formats picks with a plain hyphen and parlay legs", () => {
    expect(pickLabel({ pick: "Bengals -6", price: "-113", legs: [] })).toBe("Bengals -6 (-113)");
    expect(pickLabel({ pick: "Same Game Parlay", price: "+400", legs: ["a", "b", "c", "d"] })).toBe("Same Game Parlay +400 (4 Legs)");
    const dashes = new RegExp(`[${String.fromCharCode(0x2212, 0x2013, 0x2014)}]`);
    expect(pickLabel({ pick: "Bengals -6", price: "-113", legs: [] })).not.toMatch(dashes);
  });
  it("labels tonight, tomorrow and later games", () => {
    const tz = "America/New_York";
    expect(whenLabel("2026-11-24T01:15:00Z", now, tz)).toBe("Tonight 8:15 PM");
    expect(whenLabel("2026-11-24T17:00:00Z", now, tz)).toBe("Tomorrow 12:00 PM");
    expect(whenLabel("2026-11-26T18:00:00Z", now, tz)).toBe("Thu 1:00 PM");
  });
});
