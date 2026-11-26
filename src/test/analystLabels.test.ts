import { describe, expect, it } from "vitest";

import { titleCaseLabels } from "../../supabase/functions/_shared/answer-labels";

// Owner, Nov 26: labels in the Analyst's answers are Title Case; sentences aren't touched.
describe("Analyst answer labels", () => {
  it("capitalizes headings, lone labels and bullet lead-ins", () => {
    expect(titleCaseLabels("Worth knowing:")).toBe("Worth Knowing:");
    expect(titleCaseLabels("**Worth knowing**")).toBe("**Worth Knowing**");
    expect(titleCaseLabels("### worth knowing")).toBe("### Worth Knowing");
    expect(titleCaseLabels("- Home and primetime: Buffalo is 5-1 ATS in its last six home games")).toBe(
      "- Home and Primetime: Buffalo is 5-1 ATS in its last six home games");
    expect(titleCaseLabels("- **Home and primetime:** Buffalo is 5-1 ATS")).toBe("- **Home and Primetime:** Buffalo is 5-1 ATS");
    expect(titleCaseLabels("* opponent: Kansas City is 2-9 ATS")).toBe("* Opponent: Kansas City is 2-9 ATS");
  });

  it("leaves sentences, records and tables alone", () => {
    const answer = [
      "The Bills are 8-2 ATS this season, tied for the best mark in the league.",
      "- The over is 5-5 in their games this season",
      "- Kansas City is 2-9 ATS in its last 11 true road games: the worst in the league",
      "| Team | ATS |",
      "| --- | --- |",
      "| home and road: | 8-2 |",
      "Want the Bills' record as a favorite?",
      "*¹ Covers, Nov 25 · ² Bettors Insider, Nov 25*",
    ].join("\n");
    expect(titleCaseLabels(answer)).toBe(answer);
  });
});
