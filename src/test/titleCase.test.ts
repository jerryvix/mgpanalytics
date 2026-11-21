import { describe, expect, it } from "vitest";

import { titleCase } from "../../packages/shared/text/title-case";

// Owner rule (docs/mobile/DECISIONS.md D-027): labels that aren't sentences are Title Case,
// with articles and short connecting words lowercase unless first or last.
describe("titleCase", () => {
  it("capitalizes every word of a label", () => {
    expect(titleCase("player props")).toBe("Player Props");
    expect(titleCase("Line movement")).toBe("Line Movement");
  });

  it("keeps small words lowercase in the middle", () => {
    expect(titleCase("browse by sport")).toBe("Browse by Sport");
    expect(titleCase("lakers vs celtics")).toBe("Lakers vs Celtics");
    expect(titleCase("the analyst")).toBe("The Analyst");
  });

  it("capitalizes a small word at the end", () => {
    expect(titleCase("sign up")).toBe("Sign Up");
  });

  it("keeps acronyms and codes as written", () => {
    expect(titleCase("NBA odds")).toBe("NBA Odds");
    expect(titleCase("season-long o/u board")).toBe("Season-Long O/U Board");
  });

  it("turns data keys into labels", () => {
    expect(titleCase("player_points")).toBe("Player Points");
  });

  it("leaves apostrophes alone", () => {
    expect(titleCase("tonight's slate")).toBe("Tonight's Slate");
  });
});
