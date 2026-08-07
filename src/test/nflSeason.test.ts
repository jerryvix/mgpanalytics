import { describe, it, expect } from "vitest";
import { mostRecentCompletedNflSeason } from "@/utils/nflSeason";
import { mostRecentCompletedNflSeason as denoTwin } from "../../supabase/functions/_shared/nfl-season";

describe("mostRecentCompletedNflSeason", () => {
  it("resolves August 2026 to the 2025 season", () => {
    expect(mostRecentCompletedNflSeason(new Date(2026, 7, 6))).toBe(2025);
  });

  it("keeps January pointing at the season before the one still running", () => {
    // Jan 2027: the 2026 season is mid-playoffs - last completed is 2025
    expect(mostRecentCompletedNflSeason(new Date(2027, 0, 15))).toBe(2025);
  });

  it("keeps February conservative (Super Bowl month)", () => {
    expect(mostRecentCompletedNflSeason(new Date(2027, 1, 28))).toBe(2025);
  });

  it("flips on March 1", () => {
    expect(mostRecentCompletedNflSeason(new Date(2027, 2, 1))).toBe(2026);
  });

  it("is dynamic - no hardcoded year", () => {
    expect(mostRecentCompletedNflSeason(new Date(2030, 7, 1))).toBe(2029);
    expect(mostRecentCompletedNflSeason(new Date(2031, 0, 1))).toBe(2029);
  });

  it("matches the Deno twin across a multi-year monthly sweep", () => {
    for (let year = 2020; year <= 2035; year++) {
      for (let month = 0; month < 12; month++) {
        const d = new Date(year, month, 15);
        expect(denoTwin(d)).toBe(mostRecentCompletedNflSeason(d));
      }
    }
  });
});
