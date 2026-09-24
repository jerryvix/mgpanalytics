import { describe, it, expect } from "vitest";
import { calcFantasyPoints } from "@/utils/nflStatsFormatters";

describe("calcFantasyPoints", () => {
  it("charges thrown interceptions from a season row's pass_int, not its defensive column", () => {
    // Jordan Love through 2026 Week 2: 532 yds, 4 TD, 1 INT = 21.28 + 16 - 2 = 35.28.
    // The season row's `interceptions` column is DEFENSIVE picks (0 here), which
    // is what the player page used to read, showing 37.3.
    const seasonRow = { pass_yards: 532, pass_td: 4, pass_int: 1, interceptions: 0, rush_yards: 0, rush_td: 0, receptions: 0, rec_yards: 0, rec_td: 0 };
    expect(calcFantasyPoints(seasonRow)).toBe(35.3);
  });

  it("still reads `interceptions` for game-log rows mapped without pass_int", () => {
    const gameLog = { pass_yards: 248, pass_td: 3, interceptions: 1, rush_yards: 69, rush_td: 2 };
    // 9.92 + 12 - 2 + 6.9 + 12 = 38.82
    expect(calcFantasyPoints(gameLog)).toBe(38.8);
  });

  it("treats a null pass_int as zero picks rather than falling back to defense", () => {
    expect(calcFantasyPoints({ pass_yards: 100, pass_int: null, interceptions: 3 })).toBe(4);
  });
});
