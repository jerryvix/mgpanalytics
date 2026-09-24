import { describe, it, expect } from "vitest";
import { gameMoves, onePerMarket, steamScore } from "@/lib/boardMoves";
import { consensusPriceMove } from "@/lib/odds";
import type { OpenQuoteLike } from "@/lib/marketPulse";

// Today's Board rails, Sep 24 2026 QC: Miami @ Clemson (odds_history game
// espn_ncaaf_401858249) filled #1 and #2 of Sharpest Moves with one market.
const game = "espn_ncaaf_401858249";
const row = (gameId: string, market: string, team: string | null, open: number, current: number) => {
  // Moneyline moves are implied-probability points, the way loadBoard builds them
  const move = market === "Moneyline" ? consensusPriceMove([{ open, current }])!.move : Math.round((current - open) * 10) / 10;
  return { gameId, market, team, open, current, move };
};

describe("onePerMarket (Sharpest Moves, Market Signal)", () => {
  it("keeps one Miami @ Clemson spread move: the steamed Hurricanes side", () => {
    const kept = onePerMarket([
      row(game, "Spread", "Miami Hurricanes", -7, -17.5),
      row(game, "Spread", "Clemson Tigers", 7, 17.5),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ team: "Miami Hurricanes", open: -7, current: -17.5 });
    // Order in which the two sides arrive does not matter
    expect(onePerMarket([row(game, "Spread", "Clemson Tigers", 7, 17.5), row(game, "Spread", "Miami Hurricanes", -7, -17.5)])[0].team).toBe(
      "Miami Hurricanes",
    );
  });

  it("keeps the moneyline side whose implied probability rose", () => {
    const miami = row(game, "Moneyline", "Miami Hurricanes", -360, -900);
    const clemson = row(game, "Moneyline", "Clemson Tigers", 285, 600);
    expect(miami.move).toBeGreaterThan(0);
    expect(clemson.move).toBeLessThan(0);
    expect(onePerMarket([clemson, miami])).toEqual([miami]);
  });

  it("follows the steam to an underdog too", () => {
    // Wisconsin @ Penn State: the dog shortened on both markets
    const g = "espn_ncaaf_401858300";
    const kept = onePerMarket([
      row(g, "Spread", "Penn State Nittany Lions", -11.5, -10),
      row(g, "Spread", "Wisconsin Badgers", 11.5, 10),
      row(g, "Moneyline", "Penn State Nittany Lions", -455, -395),
      row(g, "Moneyline", "Wisconsin Badgers", 350, 310),
    ]);
    expect(kept.map((m) => `${m.market} ${m.team}`)).toEqual(["Spread Wisconsin Badgers", "Moneyline Wisconsin Badgers"]);
  });

  it("leaves totals, other games and unpaired sides alone", () => {
    const moves = [
      row(game, "Total", "Over", 55.5, 50.5),
      row(game, "Spread", "Miami Hurricanes", -7, -17.5),
      row("espn_ncaaf_1", "Spread", "Liberty Flames", 1.5, -2.5),
      row("espn_ncaaf_2", "Moneyline", "Clemson Tigers", 285, 600), // its partner fell out upstream
    ];
    expect(onePerMarket(moves)).toEqual(moves);
  });

  it("scores a spread by its own number shrinking and a moneyline by implied probability", () => {
    expect(steamScore({ gameId: game, market: "Spread", move: -10.5 })).toBe(10.5);
    expect(steamScore({ gameId: game, market: "Moneyline", move: 11.7 })).toBe(11.7);
    expect(steamScore({ gameId: game, market: "Total", move: -5 })).toBe(-5);
  });
});

describe("gameMoves (open to the grid's number)", () => {
  const open = (market: string, side: string, line: number | null, price: number | null): OpenQuoteLike => ({
    market,
    side,
    open_line: line,
    open_price: price,
  });
  // Arizona @ Washington State, Sep 24 2026: DraftKings' open from the stored
  // line; "now" is the grid's row after the 10:25 run (-410 / +320)
  const azWsu = {
    gameId: "df988ca5",
    away: "Arizona Wildcats",
    home: "Washington State Cougars",
    now: { spread_value: 10, spread_odds: -105, moneyline_away: -410, moneyline_home: 320, total_value: 48.5, total_over_odds: -110, total_under_odds: -110 },
    opens: [
      open("moneyline", "away", null, -575),
      open("moneyline", "home", null, 425),
      open("spread", "away", -13.5, -110),
      open("spread", "home", 13.5, -110),
      open("total", "over", 48.5, -110),
      open("total", "under", 48.5, -110),
    ],
  };

  it("reads each side from DraftKings' open to the grid's number, never another capture", () => {
    const m = gameMoves(azWsu);
    const ml = m.filter((x) => x.market === "Moneyline");
    expect(ml.map((x) => [x.team, x.open, x.current])).toEqual([
      ["Arizona Wildcats", -575, -410],
      ["Washington State Cougars", 425, 320],
    ]);
    expect(ml[1].move).toBeGreaterThan(0); // the dog's price shortened: steamed
    expect(ml[0].move).toBe(-ml[1].move);
    const spread = m.filter((x) => x.market === "Spread");
    expect(spread.map((x) => [x.team, x.open, x.current, x.move])).toEqual([
      ["Arizona Wildcats", -13.5, -10, 3.5],
      ["Washington State Cougars", 13.5, 10, -3.5],
    ]);
    expect(onePerMarket(spread)[0].team).toBe("Washington State Cougars");
    expect(m.find((x) => x.market === "Total")).toMatchObject({ team: "Over", open: 48.5, current: 48.5, move: 0 });
  });

  it("has no moneyline move for an empty moneyline cell (CMU @ Miami)", () => {
    const m = gameMoves({
      gameId: "cmu-mia",
      away: "Central Michigan Chippewas",
      home: "Miami Hurricanes",
      now: { spread_value: -41.5, spread_odds: -112, moneyline_away: null, moneyline_home: null, total_value: 58.5, total_over_odds: -110, total_under_odds: -110 },
      opens: [open("spread", "home", -40.5, -110), open("moneyline", "home", null, -360)],
    });
    expect(m.filter((x) => x.market === "Moneyline")).toEqual([]);
    expect(m.find((x) => x.market === "Spread" && x.team === "Miami Hurricanes")).toMatchObject({ open: -40.5, current: -41.5, move: -1 });
  });

  it("writes an even-money open as +100 and fills a missing side's open from the other", () => {
    const m = gameMoves({
      gameId: "lib-ccu",
      away: "Liberty Flames",
      home: "Coastal Carolina Chanticleers",
      now: { spread_value: 2.5, spread_odds: -108, moneyline_away: -135, moneyline_home: 114, total_value: 50.5, total_over_odds: -105, total_under_odds: -115 },
      opens: [open("moneyline", "away", null, -100), open("moneyline", "home", null, -120), open("spread", "away", 1.5, -110), open("total", "under", 54.5, -110)],
    });
    expect(m.find((x) => x.team === "Liberty Flames" && x.market === "Moneyline")).toMatchObject({ open: 100, current: -135 });
    expect(m.find((x) => x.team === "Coastal Carolina Chanticleers" && x.market === "Spread")).toMatchObject({ open: -1.5, current: 2.5 });
    expect(m.find((x) => x.market === "Total")).toMatchObject({ open: 54.5, current: 50.5, move: -4 });
  });

  it("has nothing to read without the grid's row", () => {
    expect(gameMoves({ ...azWsu, now: null })).toEqual([]);
  });
});
