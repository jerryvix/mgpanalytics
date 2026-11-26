import { describe, expect, it } from "vitest";

import { dropFinalPeriods, tidyAnswer, titleCaseLabels } from "../../supabase/functions/_shared/answer-labels";

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

  it("drops the period that ends each line, keeping the ones between sentences", () => {
    expect(dropFinalPeriods("- Home and Road: 4-1 ATS each.")).toBe("- Home and Road: 4-1 ATS each");
    expect(dropFinalPeriods("- Total: Opened at 49.5 and is now 46.5. The Under has 49% of money.")).toBe(
      "- Total: Opened at 49.5 and is now 46.5. The Under has 49% of money");
    expect(dropFinalPeriods("The Bills are 8-2 ATS this season through Nov 22nd (Tied 1st in NFL).")).toBe(
      "The Bills are 8-2 ATS this season through Nov 22nd (Tied 1st in NFL)");
    expect(dropFinalPeriods("*Response was trimmed for length. Try a more specific question.*")).toBe(
      "*Response was trimmed for length. Try a more specific question*");
    expect(dropFinalPeriods("Want the Bills' record as a favorite?")).toBe("Want the Bills' record as a favorite?");
    expect(dropFinalPeriods("- Kansas City vs.")).toBe("- Kansas City vs.");
    expect(dropFinalPeriods("Wait...")).toBe("Wait...");
    expect(dropFinalPeriods("| 8-2. | x. |")).toBe("| 8-2. | x. |");
  });

  it("tidies a whole answer", () => {
    expect(tidyAnswer("Worth knowing:\n- Home and primetime: 5-1 ATS.")).toBe("Worth Knowing:\n- Home and Primetime: 5-1 ATS");
  });
});
