import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  calcCatchRate,
  calculateAdvancedStats,
  hasAdvancedStats,
  type AdvancedStatsInput,
} from "@/utils/advancedStatsCalculator";
import { getStatDefinitions } from "@/data/statDefinitions";
import { NFLAdvancedStats } from "@/components/players/NFLAdvancedStats";

// Season rows shaped like player_season_stats. Defensive columns default to 0 because no
// sync writes them yet, so offensive rows carry tackles: 0.
const QB: AdvancedStatsInput = { games_played: 17, passer_rating: 101.4, targets: 0, receptions: 0, tackles: 0 };
const WR: AdvancedStatsInput = { games_played: 17, passer_rating: null, targets: 160, receptions: 104, tackles: 0 };
const RB: AdvancedStatsInput = { games_played: 16, passer_rating: null, targets: 60, receptions: 48, tackles: 0 };
const LB: AdvancedStatsInput = { games_played: 15, passer_rating: null, targets: 0, receptions: 0, tackles: 120, qb_hits: 9 };

const CASES: Array<[position: string, stats: AdvancedStatsInput]> = [
  ["QB", QB],
  ["Quarterback", QB],
  ["WR", WR],
  ["TE", WR],
  ["RB", RB],
  ["LB", LB],
  ["CB", LB],
  ["K", QB],
];

// The code behind the NFL player page's Advanced tab.
const ADVANCED_TAB_SOURCES = [
  "../utils/advancedStatsCalculator.ts",
  "../data/statDefinitions.ts",
  "../components/players/NFLAdvancedStats.tsx",
];

describe("advancedStatsCalculator is deterministic", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the same output for the same input", () => {
    for (const [position, stats] of CASES) {
      const first = calculateAdvancedStats(stats, position);
      for (let i = 0; i < 5; i++) {
        expect(calculateAdvancedStats(structuredClone(stats), position)).toEqual(first);
      }
    }
  });

  it("does not change its input", () => {
    for (const [position, stats] of CASES) {
      const before = structuredClone(stats);
      calculateAdvancedStats(stats, position);
      expect(stats).toEqual(before);
    }
  });

  it("never calls Math.random", () => {
    const random = vi.spyOn(Math, "random");
    for (const [position, stats] of CASES) {
      calculateAdvancedStats(stats, position);
      hasAdvancedStats(stats, position);
    }
    expect(random).not.toHaveBeenCalled();
  });

  it.each(ADVANCED_TAB_SOURCES)("%s contains no Math.random", (file) => {
    const source = readFileSync(resolve(__dirname, file), "utf-8");
    expect(source).not.toMatch(/Math\s*\.\s*random/);
  });
});

describe("advancedStatsCalculator returns only stats computed from stored data", () => {
  it("passes the stored passer rating through for quarterbacks", () => {
    expect(calculateAdvancedStats(QB, "QB")).toEqual({ passer_rating: 101.4 });
    expect(calculateAdvancedStats(QB, "Quarterback")).toEqual({ passer_rating: 101.4 });
  });

  it("computes catch rate as receptions over targets for receivers", () => {
    expect(calculateAdvancedStats(WR, "WR")).toEqual({ catch_rate: 65 });
    expect(calculateAdvancedStats(WR, "TE")).toEqual({ catch_rate: 65 });
  });

  it("computes tackles per game and passes QB hits through for defenders", () => {
    expect(calculateAdvancedStats(LB, "LB")).toEqual({ tackles_per_game: 8, qb_hits: 9 });
  });

  it("returns nothing for running backs and positions without real advanced stats", () => {
    expect(calculateAdvancedStats(RB, "RB")).toEqual({});
    expect(calculateAdvancedStats(QB, "K")).toEqual({});
    expect(calculateAdvancedStats(QB, "")).toEqual({});
  });

  it("leaves out a stat when its inputs are missing instead of guessing", () => {
    expect(calculateAdvancedStats(null, "QB")).toEqual({});
    expect(calculateAdvancedStats(undefined, "WR")).toEqual({});
    expect(calculateAdvancedStats({ ...QB, passer_rating: null }, "QB")).toEqual({});
    expect(calculateAdvancedStats({ ...WR, targets: 0 }, "WR")).toEqual({});
    expect(calculateAdvancedStats({ ...WR, targets: null }, "WR")).toEqual({});
    // tackles alone, without games played, is not a per-game number
    expect(calculateAdvancedStats({ ...LB, games_played: 0 }, "LB")).toEqual({ qb_hits: 9 });
    // default-zero defensive columns are treated as not synced
    expect(calculateAdvancedStats({ ...LB, tackles: 0, qb_hits: 0 }, "LB")).toEqual({});
  });

  it("calcCatchRate needs targets but allows zero receptions", () => {
    expect(calcCatchRate(10, 0)).toBe(0);
    expect(calcCatchRate(8, 6)).toBe(75);
    expect(calcCatchRate(0, 0)).toBeUndefined();
    expect(calcCatchRate(null, 5)).toBeUndefined();
    expect(calcCatchRate(10, null)).toBeUndefined();
  });

  it("only defines stats the calculator actually computes", () => {
    const fullRows: Array<[group: string, position: string, stats: AdvancedStatsInput]> = [
      ["QB", "QB", QB],
      ["RB", "RB", RB],
      ["WR_TE", "WR", WR],
      ["DEF", "LB", LB],
    ];
    for (const [group, position, stats] of fullRows) {
      const computed = Object.keys(calculateAdvancedStats(stats, position)).sort();
      const defined = getStatDefinitions(group).map((d) => d.key).sort();
      expect(defined).toEqual(computed);
    }
  });
});

describe("Advanced tab visibility", () => {
  it("shows the tab only when a stat can be computed", () => {
    expect(hasAdvancedStats(QB, "QB")).toBe(true);
    expect(hasAdvancedStats(WR, "WR")).toBe(true);
    expect(hasAdvancedStats(LB, "LB")).toBe(true);
    expect(hasAdvancedStats(RB, "RB")).toBe(false);
    expect(hasAdvancedStats(QB, "K")).toBe(false);
    expect(hasAdvancedStats({ ...LB, tackles: 0, qb_hits: 0 }, "LB")).toBe(false);
    // stats still loading
    expect(hasAdvancedStats(undefined, "QB")).toBe(false);
  });

  it("renders only the computed stat cards", () => {
    render(createElement(NFLAdvancedStats, { stats: WR, position: "WR" }));
    expect(screen.getByText("Advanced Stats")).toBeInTheDocument();
    expect(screen.getByText("Catch%")).toBeInTheDocument();
    expect(screen.getByText("65.0%")).toBeInTheDocument();
    expect(screen.queryByText("Sep")).not.toBeInTheDocument();
    expect(screen.queryByText("Tgt%")).not.toBeInTheDocument();
  });

  it("renders nothing when no stat can be computed", () => {
    const { container } = render(createElement(NFLAdvancedStats, { stats: RB, position: "RB" }));
    expect(container).toBeEmptyDOMElement();
  });
});
