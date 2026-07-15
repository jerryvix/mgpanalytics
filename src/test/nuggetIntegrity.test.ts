import { describe, it, expect } from "vitest";
import { NFL_TRENDING, NCAAF_TRENDING, MLB_TRENDING, type TrendingBet } from "@/data/trendingBets";
import { EDGE_POOL } from "@/data/edges";

// Gate 1 of the nugget release process (docs/nugget-grading.md): structural
// integrity every build. Factual grading (Gate 2) runs on the scheduled review.

const ALL_BETS: TrendingBet[] = [...NFL_TRENDING, ...NCAAF_TRENDING, ...MLB_TRENDING];
const RELEASED = ALL_BETS.filter((b) => b.verified);

// Wording that signals an unverified or hedged claim — never ship these.
const HEDGE_TELLS = /\b(probably|reportedly|some say|believed to|rumored|might have|allegedly)\b/i;
// Year ranges must use the compact apostrophe style ('YY-'YY), not (2020-2021).
const FULL_YEAR_RANGE = /\(\s*(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\s*\)/;
const PLACEHOLDER_SOURCE = /^(tbd|unknown|n\/a|todo|)$/i;

describe("Trending Bets structural integrity (release gate 1)", () => {
  it("has no duplicate ids", () => {
    const ids = ALL_BETS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(RELEASED.map((b) => [b.id, b] as const))(
    "%s: required fields present and clean",
    (_id, bet) => {
      expect(bet.nugget.trim().length).toBeGreaterThan(40);
      expect(bet.source.trim()).not.toMatch(PLACEHOLDER_SOURCE);
      expect(bet.line.trim().length).toBeGreaterThan(0);
      expect(bet.book.trim().length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(bet.updated))).toBe(false);
    }
  );

  it.each(RELEASED.map((b) => [b.id, b] as const))(
    "%s: no hedge language or wrong year-range style",
    (_id, bet) => {
      expect(bet.nugget).not.toMatch(HEDGE_TELLS);
      expect(bet.nugget).not.toMatch(FULL_YEAR_RANGE);
    }
  );
});

describe("Edge pool structural integrity", () => {
  it("has no duplicate ids", () => {
    const ids = EDGE_POOL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(EDGE_POOL.map((e) => [e.id, e] as const))("%s: sourced and clean", (_id, edge) => {
    expect(edge.detail.trim().length).toBeGreaterThan(40);
    expect(edge.source.trim()).not.toMatch(PLACEHOLDER_SOURCE);
    expect(edge.detail).not.toMatch(HEDGE_TELLS);
    expect(edge.detail).not.toMatch(FULL_YEAR_RANGE);
    if (edge.market) {
      expect(edge.market.label.trim().length).toBeGreaterThan(0);
      expect(edge.market.line.trim().length).toBeGreaterThan(0);
      expect(edge.market.book.trim().length).toBeGreaterThan(0);
    }
  });
});
