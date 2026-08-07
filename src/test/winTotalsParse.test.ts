import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseWinTotalsPage,
  parseAmericanOdds,
  parseAsOfDate,
  NFL_TEAM_ABBR,
} from "../../supabase/functions/sync-win-totals/parse";

// Fixture is the real soh1 table from
// https://www.covers.com/sportsoddshistory/nfl-win/?y=2024&sa=nfl&t=win
// (fetched 2026-08-06). Values asserted below were read off the live page.
const html = readFileSync(
  resolve(__dirname, "fixtures/covers-win-totals-2024.html"),
  "utf-8"
);

describe("parseWinTotalsPage", () => {
  const page = parseWinTotalsPage(html);

  it("parses all 32 teams", () => {
    expect(page.rows).toHaveLength(32);
    expect(page.rows.every((r) => r.teamAbbr !== null)).toBe(true);
  });

  it("reads line, odds, actual wins, and the page's own grade", () => {
    const cardinals = page.rows.find((r) => r.teamName === "Arizona Cardinals")!;
    expect(cardinals.teamAbbr).toBe("ARI");
    expect(cardinals.line).toBe(7);
    expect(cardinals.overOdds).toBe(-130);
    expect(cardinals.underOdds).toBe(110);
    expect(cardinals.actualWins).toBe(8);
    expect(cardinals.pageResult).toBe("over");

    const ravens = page.rows.find((r) => r.teamName === "Baltimore Ravens")!;
    expect(ravens.line).toBe(10.5);
    expect(ravens.overOdds).toBe(100);
    expect(ravens.underOdds).toBe(-120);
    expect(ravens.actualWins).toBe(12);
    expect(ravens.pageResult).toBe("over");
  });

  it("extracts the as-of date from above the table", () => {
    expect(page.asOf).toBe("2024-09-05");
  });

  it("re-grading from line vs actual agrees with the page's own grade", () => {
    for (const r of page.rows) {
      if (r.actualWins === null || r.pageResult === null) continue;
      const computed =
        r.actualWins > r.line ? "over" : r.actualWins < r.line ? "under" : "push";
      expect(computed, `${r.teamName} ${r.actualWins} vs ${r.line}`).toBe(r.pageResult);
    }
  });

  it("throws on a page without the table", () => {
    expect(() => parseWinTotalsPage("<html><body>nope</body></html>")).toThrow(/soh1/);
  });
});

describe("parseAmericanOdds", () => {
  it("parses signed odds and rejects junk", () => {
    expect(parseAmericanOdds("+155")).toBe(155);
    expect(parseAmericanOdds("-185")).toBe(-185);
    expect(parseAmericanOdds(" -110 ")).toBe(-110);
    expect(parseAmericanOdds("100")).toBe(100);
    expect(parseAmericanOdds("--")).toBeNull();
    expect(parseAmericanOdds("")).toBeNull();
    expect(parseAmericanOdds("-36")).toBeNull(); // no legal price inside +/-100
  });
});

describe("parseAsOfDate", () => {
  it("converts the page's long date to ISO", () => {
    expect(parseAsOfDate("As of September 5, 2024")).toBe("2024-09-05");
    expect(parseAsOfDate("Lines courtesy of BetMGM As of September 4, 2025")).toBe("2025-09-04");
    expect(parseAsOfDate("no date here")).toBeNull();
  });
});

describe("NFL_TEAM_ABBR", () => {
  it("covers historical names in the 2018+ backfill window", () => {
    expect(NFL_TEAM_ABBR["Oakland Raiders"]).toBe("LV");
    expect(NFL_TEAM_ABBR["Washington Redskins"]).toBe("WAS");
    expect(NFL_TEAM_ABBR["Washington Football Team"]).toBe("WAS");
    expect(NFL_TEAM_ABBR["Washington Commanders"]).toBe("WAS");
  });
});
