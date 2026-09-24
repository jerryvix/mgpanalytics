import { describe, it, expect } from "vitest";
import {
  agoLabel,
  buildMarketPulse,
  buildMarketView,
  chooseLine,
  movedToward,
  openToNow,
  PUBLIC_BETS_PCT,
  SHARP_EDGE_PTS,
  withStoredLine,
  type LineRowLike,
  type OddsRowLike,
  type PulseInput,
  type SplitRowLike,
} from "@/lib/marketPulse";

// Real captures from Sep 24 2026: splits from the DK Network page, lines
// (current + DraftKings' open) from ESPN's DraftKings feed
const at = "2026-09-24T06:43:44.106Z";
const lineAt = "2026-09-24T08:10:00.000Z";
const split = (market: string, side: string, bets: number, handle: number): SplitRowLike => ({
  market,
  side,
  bets_pct: bets,
  handle_pct: handle,
  captured_at: at,
});
const line = (
  market: string,
  side: string,
  current: number | null,
  price: number | null,
  openLine: number | null,
  openPrice: number | null,
): LineRowLike => ({ market, side, line: current, price, open_line: openLine, open_price: openPrice, captured_at: lineAt });
const input = (splits: SplitRowLike[], lines: LineRowLike[], odds: OddsRowLike | null = null): PulseInput => ({ splits, lines, odds });

const liberty = input(
  [
    split("spread", "away", 79, 90),
    split("spread", "home", 21, 10),
    split("total", "over", 50, 55),
    split("total", "under", 50, 45),
    split("moneyline", "away", 58, 88),
    split("moneyline", "home", 42, 12),
  ],
  [
    line("spread", "away", -2.5, -112, 1.5, -110),
    line("spread", "home", 2.5, -108, -1.5, -110),
    line("total", "over", 50.5, -105, 54.5, -110),
    line("total", "under", 50.5, -115, 54.5, -110),
    line("moneyline", "away", null, -135, null, 100),
    line("moneyline", "home", null, 114, null, -120),
  ],
);

describe("thresholds", () => {
  it("reuses the chat's sharp threshold and a 60% public cut", () => {
    expect(SHARP_EDGE_PTS).toBe(10);
    expect(PUBLIC_BETS_PCT).toBe(60);
  });
});

describe("signals", () => {
  it("Liberty spread: public side, not sharp (the money agrees with the crowd), no reverse move", () => {
    const v = buildMarketView("spread", liberty)!;
    expect(v.lineSource).toBe("lines");
    expect(v.lineAsOf).toBe(lineAt);
    expect(v.splitsAsOf).toBe(at);
    expect(v.sides[0]).toMatchObject({ side: "away", line: -2.5, price: -112, betsPct: 79, handlePct: 90, openLine: 1.5 });
    // 90% of the money beats 79% of the bets by 11, but on the MAJORITY side
    expect(v.sides[0]).toMatchObject({ sharp: false, publicSide: true, reverseMove: false });
    expect(v.sides[1]).toMatchObject({ sharp: false, publicSide: false, reverseMove: false });
  });

  it("Oklahoma @ Georgia total: 79% of bets on the Over, the total fell 52.5 to 44.5", () => {
    const v = buildMarketView(
      "total",
      input(
        [split("total", "over", 79, 12), split("total", "under", 21, 88)],
        [line("total", "over", 44.5, -110, 52.5, -110), line("total", "under", 44.5, -110, 52.5, -110)],
      ),
    )!;
    expect(v.sides[0]).toMatchObject({ side: "over", publicSide: true, sharp: false, reverseMove: false });
    expect(v.sides[1]).toMatchObject({ side: "under", publicSide: false, sharp: true, reverseMove: true });
  });

  it("Wisconsin @ Penn State: public on Penn State, spread and moneyline both moved toward Wisconsin", () => {
    const wis = input(
      [
        split("spread", "away", 24, 31),
        split("spread", "home", 76, 69),
        split("moneyline", "away", 5, 55),
        split("moneyline", "home", 95, 45),
      ],
      [
        line("spread", "away", 10, -110, 11.5, -115),
        line("spread", "home", -10, -110, -11.5, -105),
        line("moneyline", "away", null, 310, null, 350),
        line("moneyline", "home", null, -395, null, -455),
      ],
    );
    const spread = buildMarketView("spread", wis)!;
    expect(spread.sides[0]).toMatchObject({ sharp: false, publicSide: false, reverseMove: true });
    expect(spread.sides[1]).toMatchObject({ publicSide: true, reverseMove: false });
    const ml = buildMarketView("moneyline", wis)!;
    // +350 to +310 is 22.2% to 24.4% implied: +2.2 points toward Wisconsin
    expect(ml.sides[0]).toMatchObject({ sharp: true, reverseMove: true });
    expect(ml.sides[1]).toMatchObject({ publicSide: true, sharp: false });
  });

  it("fires nothing on a one-sided (thin) market but still shows DK's numbers", () => {
    const v = buildMarketView(
      "total",
      input(
        [split("total", "over", 100, 100), split("total", "under", 0, 0)],
        [line("total", "over", 55.5, -105, 52.5, -110), line("total", "under", 55.5, -115, 52.5, -110)],
      ),
    )!;
    expect(v.thin).toBe(true);
    expect(v.sides[0]).toMatchObject({ betsPct: 100, handlePct: 100, publicSide: false, sharp: false, reverseMove: false });
  });

  it("hides the reverse-move input entirely without DraftKings' open", () => {
    const v = buildMarketView(
      "spread",
      input(
        [split("spread", "away", 29, 42), split("spread", "home", 71, 58)],
        [line("spread", "away", 4.5, -105, null, null), line("spread", "home", -4.5, -115, null, null)],
      ),
    )!;
    expect(v.hasOpen).toBe(false);
    expect(v.sides.every((s) => !s.reverseMove)).toBe(true);
    expect(v.sides[1].publicSide).toBe(true);
    // 42% of the money on 29% of the bets: +13, but the money is still a minority
    expect(v.sides[0].sharp).toBe(false);
  });
});

describe("markers follow DraftKings' live split (QC round 2, Sep 24 2026)", () => {
  // The stored 06:43 copies vs DK's live page at 10:28, same stored line
  const armyTemple = (overBets: number, overMoney: number) =>
    buildMarketView(
      "total",
      input(
        [split("total", "over", overBets, overMoney), split("total", "under", 100 - overBets, 100 - overMoney)],
        [line("total", "over", 47.5, -118, 49.5, -110), line("total", "under", 47.5, -102, 49.5, -110)],
      ),
    )!;
  const kcMia = (underBets: number, underMoney: number) =>
    buildMarketView(
      "total",
      input(
        [split("total", "over", 100 - underBets, 100 - underMoney), split("total", "under", underBets, underMoney)],
        [line("total", "over", 46.5, -105, 44.5, -110), line("total", "under", 46.5, -115, 44.5, -110)],
      ),
    )!;

  it("Army @ Temple: 63% on the Over while the total fell 49.5 to 47.5 is Public on the Over and Reverse on the Under", () => {
    expect(armyTemple(57, 28).sides.map((x) => [x.publicSide, x.reverseMove])).toEqual([
      [false, false],
      [false, false],
    ]); // the stale copy: no marker
    const live = armyTemple(63, 30);
    expect(live.sides[0]).toMatchObject({ side: "over", publicSide: true, reverseMove: false });
    expect(live.sides[1]).toMatchObject({ side: "under", publicSide: false, reverseMove: true });
  });

  it("KC @ MIA: 59% on the Under is no public side, so no reverse move on the Over", () => {
    expect(kcMia(67, 85).sides.map((x) => [x.side, x.publicSide, x.reverseMove])).toEqual([
      ["over", false, true],
      ["under", true, false],
    ]); // what the stale copy showed
    expect(kcMia(59, 70).sides.every((x) => !x.publicSide && !x.reverseMove)).toBe(true);
  });

  it("dates the split by DK's page freshness when the sync recorded one", () => {
    const page = "2026-09-24T06:43:44.106Z";
    const v = buildMarketView("total", input([{ ...split("total", "over", 57, 28), source_as_of: page }, { ...split("total", "under", 43, 72), source_as_of: page }], []))!;
    expect(v.splitsAsOf).toBe(page);
    expect(buildMarketView("total", input([split("total", "over", 57, 28), split("total", "under", 43, 72)], []))!.splitsAsOf).toBe(at);
  });
});

describe("sharp side (canonical read)", () => {
  const view = (awayBets: number, awayMoney: number) =>
    buildMarketView(
      "spread",
      input(
        [split("spread", "away", awayBets, awayMoney), split("spread", "home", 100 - awayBets, 100 - awayMoney)],
        [line("spread", "away", 3, -110, 3, -110), line("spread", "home", -3, -110, -3, -110)],
      ),
    )!;

  it("needs a minority of bets, a majority of money and a 10-point gap", () => {
    expect(view(40, 60).sides[0].sharp).toBe(true);
    expect(view(49, 59).sides[0].sharp).toBe(true); // exactly the threshold
    expect(view(45, 54).sides[0].sharp).toBe(false); // gap 9
    expect(view(50, 70).sides[0].sharp).toBe(false); // not a minority of bets
    expect(view(3, 13).sides[0].sharp).toBe(false); // money still a minority
    expect(view(79, 90).sides[0].sharp).toBe(false); // the crowd's side
  });

  it("can only ever light one side of a market", () => {
    for (let bets = 1; bets < 100; bets += 7) {
      for (let money = 1; money < 100; money += 7) {
        expect(view(bets, money).sides.filter((s) => s.sharp).length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("movedToward", () => {
  it("reads spreads by the side's own number, then by price when the number held", () => {
    expect(movedToward("spread", "away", { line: -2.5, price: -112 }, { line: 1.5, price: -110 })).toBe(true);
    expect(movedToward("spread", "home", { line: 2.5, price: -108 }, { line: -1.5, price: -110 })).toBe(false);
    expect(movedToward("spread", "home", { line: -3, price: -120 }, { line: -3, price: -110 })).toBe(true);
    expect(movedToward("spread", "home", { line: -3, price: -115 }, { line: -3, price: -110 })).toBe(false);
  });

  it("reads totals by direction and moneylines in implied-probability space", () => {
    expect(movedToward("total", "over", { line: 55.5, price: -105 }, { line: 52.5, price: -110 })).toBe(true);
    expect(movedToward("total", "under", { line: 55.5, price: -115 }, { line: 52.5, price: -110 })).toBe(false);
    // -112 to -136 is arithmetically "down" but the side is being backed
    expect(movedToward("moneyline", "home", { line: null, price: -136 }, { line: null, price: -112 })).toBe(true);
    expect(movedToward("moneyline", "away", { line: null, price: 120 }, { line: null, price: 100 })).toBe(false);
    expect(movedToward("moneyline", "away", { line: null, price: 120 }, { line: null, price: null })).toBeNull();
  });
});

describe("one line source", () => {
  // NYJ @ DET, Sep 24 2026: the daily NFL games sync wrote the odds row at
  // 06:15 (+240 / -298); the stored DraftKings line is the later capture.
  const nyj = input(
    [split("moneyline", "away", 30, 45), split("moneyline", "home", 70, 55)],
    [line("moneyline", "away", null, 245, null, 340), line("moneyline", "home", null, -305, null, -440)],
    {
      spread_value: -6,
      spread_odds: -110,
      moneyline_home: -298,
      moneyline_away: 240,
      total_value: 47.5,
      total_over_odds: -110,
      total_under_odds: -110,
      updated_at: "2026-09-24T06:15:06.812Z",
    },
  );

  it("shows the stored DraftKings line when it is the fresher capture", () => {
    const p = buildMarketPulse(nyj);
    expect(p.moneyline).toMatchObject({ lineSource: "lines", lineAsOf: lineAt });
    expect(p.moneyline!.sides.map((s) => s.price)).toEqual([245, -305]);
    expect(openToNow(p.moneyline!)).toBe("Open +340 / -440 → Now +245 / -305");
    // An odds row with no capture time never beats a stored line
    const undated = buildMarketPulse({ ...nyj, odds: { ...nyj.odds!, updated_at: null } });
    expect(undated.moneyline!.sides.map((s) => s.price)).toEqual([245, -305]);
  });

  it("takes a fresher, different odds-table capture market by market, keeping DK's stored open", () => {
    const newer = "2026-09-24T10:00:00.000Z";
    const p = buildMarketPulse({
      splits: [],
      lines: [
        line("spread", "away", 6.5, -105, 9.5, -110),
        line("spread", "home", -6.5, -115, -9.5, -110),
        line("total", "over", 47.5, -108, 44.5, -110),
        line("total", "under", 47.5, -112, 44.5, -110),
        line("moneyline", "away", null, 245, null, 340),
        line("moneyline", "home", null, -305, null, -440),
      ],
      odds: {
        spread_value: -6.5,
        spread_odds: -110, // the home price moved since the stored capture
        moneyline_home: -310,
        moneyline_away: 250,
        total_value: 47.5,
        total_over_odds: -108,
        total_under_odds: -112, // the total did not move
        updated_at: newer,
      },
    });
    expect(p.moneyline).toMatchObject({ lineSource: "odds", lineAsOf: newer, hasOpen: true });
    expect(openToNow(p.moneyline!)).toBe("Open +340 / -440 → Now +250 / -310");
    expect(p.spread).toMatchObject({ lineSource: "odds", lineAsOf: newer });
    // The odds tables keep the home price only: no lopsided pair
    expect(p.spread!.sides.map((s) => [s.line, s.price])).toEqual([
      [6.5, null],
      [-6.5, -110],
    ]);
    // The same number confirmed later: still the stored pair, as of the newer capture
    expect(p.total).toMatchObject({ lineSource: "lines", lineAsOf: newer });
    expect(p.total!.sides.map((s) => s.price)).toEqual([-108, -112]);
    // chooseLine is the rule every surface calls
    expect(chooseLine("moneyline", [], null)).toBeNull();
    expect(chooseLine("total", [line("total", "over", 47.5, -108, null, null)], null)).toBeNull(); // one side is no line
  });

  it("falls back to the odds row only for a market with no stored line", () => {
    const p = buildMarketPulse(nyj);
    expect(p.spread).toMatchObject({ lineSource: "odds", hasSplits: false, hasOpen: false });
    expect(p.spread!.sides[0]).toMatchObject({ side: "away", line: 6, price: null });
    expect(p.spread!.sides[1]).toMatchObject({ side: "home", line: -6, price: -110 });
    expect(buildMarketPulse(input([], [], null))).toEqual({ spread: null, total: null, moneyline: null });
  });

  it("keeps a split with no stored line as bars only, never a borrowed number", () => {
    const v = buildMarketView("total", input([split("total", "over", 60, 70), split("total", "under", 40, 30)], []))!;
    expect(v).toMatchObject({ lineSource: null, hasOpen: false });
    expect(v.sides.map((s) => s.line)).toEqual([null, null]);
    expect(v.sides[0].publicSide).toBe(true);
  });

  it("takes DraftKings' open from the latest odds_history capture when no line is stored (MLB)", () => {
    const mlb: PulseInput = {
      splits: [],
      lines: [],
      odds: {
        spread_value: -1.5,
        spread_odds: null,
        moneyline_home: -145,
        moneyline_away: 135,
        total_value: 8,
        total_over_odds: -112,
        total_under_odds: -108,
        updated_at: at,
      },
      opens: [
        { market: "moneyline", side: "away", open_line: null, open_price: 150 },
        { market: "moneyline", side: "home", open_line: null, open_price: -162 },
        { market: "total", side: "over", open_line: 8.5, open_price: null },
        { market: "total", side: "under", open_line: 8.5, open_price: null },
      ],
    };
    const p = buildMarketPulse(mlb);
    expect(openToNow(p.moneyline!)).toBe("Open +150 / -162 → Now +135 / -145");
    expect(openToNow(p.total!)).toBe("Open 8.5 → Now 8");
    expect(p.spread!.hasOpen).toBe(false);
  });
});

describe("openToNow", () => {
  it("writes Open X → Now Y per market, prices only when the number held", () => {
    const p = buildMarketPulse(liberty);
    expect(openToNow(p.spread!)).toBe("Open +1.5 → Now -2.5");
    expect(openToNow(p.total!)).toBe("Open 54.5 → Now 50.5");
    expect(openToNow(p.moneyline!)).toBe("Open +100 / -120 → Now -135 / +114");
    const held = buildMarketView(
      "spread",
      input([], [line("spread", "away", 3, -120, 3, -110), line("spread", "home", -3, 100, -3, -110)]),
    )!;
    expect(openToNow(held)).toBe("Open +3 (-110) → Now +3 (-120)");
    const flat = buildMarketView(
      "spread",
      input([], [line("spread", "away", 3, -110, 3, -110), line("spread", "home", -3, -110, -3, -110)]),
    )!;
    expect(openToNow(flat)).toBe("Open +3, unchanged");
  });

  it("says whose price moved when a total held (the Over's), and writes even money as +100", () => {
    const total = buildMarketView(
      "total",
      input([], [line("total", "over", 54.5, -112, 54.5, -110), line("total", "under", 54.5, -108, 54.5, -110)]),
    )!;
    expect(openToNow(total)).toBe("Open 54.5 → Now 54.5 · Over -110 → -112");
    const even = buildMarketView(
      "moneyline",
      input([], [line("moneyline", "away", null, -135, null, -100), line("moneyline", "home", null, 114, null, -120)]),
    )!;
    expect(even.sides[0].openPrice).toBe(100);
    expect(openToNow(even)).toBe("Open +100 / -120 → Now -135 / +114");
  });
});

describe("withStoredLine (slate cards)", () => {
  const odds = {
    id: "o1",
    spread_value: 1.5,
    spread_odds: -110,
    moneyline_home: 100,
    moneyline_away: -120,
    total_value: 54.5,
    total_over_odds: -110,
    total_under_odds: -110,
  };

  it("lays the stored line over the odds row market by market", () => {
    const merged = withStoredLine(odds, liberty.lines)!;
    expect(merged).toMatchObject({
      id: "o1",
      spread_value: 2.5,
      spread_odds: -108,
      spread_away_odds: -112, // only the stored line has the away price
      moneyline_home: 114,
      moneyline_away: -135,
      total_value: 50.5,
      total_over_odds: -105,
      total_under_odds: -115,
    });
    // No stored total: the odds row's total stays
    const partial = withStoredLine(odds, liberty.lines.filter((l) => l.market !== "total"))!;
    expect(partial.total_value).toBe(54.5);
    // No stored spread: the home price alone, no away price
    const noSpread = withStoredLine(odds, liberty.lines.filter((l) => l.market !== "spread"))!;
    expect(noSpread).toMatchObject({ spread_value: 1.5, spread_odds: -110, spread_away_odds: null });
  });

  it("keeps the odds row's number for a market where it is the fresher, different capture", () => {
    const fresher = { ...odds, moneyline_home: 120, moneyline_away: -142, updated_at: "2026-09-24T09:31:00.000Z" };
    const merged = withStoredLine(fresher, liberty.lines)!;
    expect(merged).toMatchObject({ moneyline_home: 120, moneyline_away: -142 }); // moved after the stored capture
    expect(merged).toMatchObject({ spread_value: 1.5, spread_odds: -110, spread_away_odds: null }); // differs too
    const stale = withStoredLine({ ...fresher, updated_at: "2026-09-24T06:15:00.000Z" }, liberty.lines)!;
    expect(stale).toMatchObject({ moneyline_home: 114, moneyline_away: -135, spread_value: 2.5 });
  });

  it("shows exactly the number Market Pulse shows, and is stable when applied twice", () => {
    const rows = [
      odds,
      { ...odds, updated_at: "2026-09-24T06:15:00.000Z" },
      { ...odds, updated_at: "2026-09-24T09:31:00.000Z" },
      { ...odds, spread_value: 2.5, spread_odds: -108, moneyline_home: 114, moneyline_away: -135, updated_at: "2026-09-24T09:31:00.000Z" },
    ];
    for (const row of rows) {
      const merged = withStoredLine(row, liberty.lines)!;
      const pulse = buildMarketPulse({ splits: [], lines: liberty.lines, odds: row });
      expect([merged.spread_away_odds, merged.spread_value, merged.spread_odds]).toEqual([
        pulse.spread!.sides[0].price,
        pulse.spread!.sides[1].line,
        pulse.spread!.sides[1].price,
      ]);
      expect([merged.moneyline_away, merged.moneyline_home]).toEqual(pulse.moneyline!.sides.map((s) => s.price));
      expect([merged.total_value, merged.total_over_odds, merged.total_under_odds]).toEqual([
        pulse.total!.sides[0].line,
        pulse.total!.sides[0].price,
        pulse.total!.sides[1].price,
      ]);
      // The slate passes the merged row on to its split markers
      expect(withStoredLine(merged, liberty.lines)).toEqual(merged);
      expect(buildMarketPulse({ splits: liberty.splits, lines: liberty.lines, odds: merged })).toEqual(
        buildMarketPulse({ splits: liberty.splits, lines: liberty.lines, odds: row }),
      );
    }
  });

  it("builds a row from lines alone and returns null with neither", () => {
    expect(withStoredLine(null, liberty.lines)).toMatchObject({ spread_value: 2.5, spread_away_odds: -112, moneyline_away: -135 });
    expect(withStoredLine(null, [])).toBeNull();
  });
});

describe("agoLabel", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  it("formats short relative times", () => {
    expect(agoLabel("2026-09-24T11:59:40Z", now)).toBe("just now");
    expect(agoLabel("2026-09-24T11:48:00Z", now)).toBe("12m ago");
    expect(agoLabel("2026-09-24T09:00:00Z", now)).toBe("3h ago");
    expect(agoLabel("2026-09-20T12:00:00Z", now)).toBe("4d ago");
    expect(agoLabel(null, now)).toBeNull();
  });
});
