import { describe, it, expect } from "vitest";
import { getEspnMlbSlug } from "@/utils/teamAbbreviations";

describe("getEspnMlbSlug", () => {
  const cases: Array<[input: string, expected: string]> = [
    // MLB Stats API abbreviations that differ from ESPN's logo slugs
    ["CWS", "chw"], // Chicago White Sox
    ["AZ", "ari"], // Arizona Diamondbacks
    ["ATH", "oak"], // Athletics (ESPN legacy slug)
    // Straight passthroughs
    ["NYY", "nyy"],
    ["LAD", "lad"],
    ["BOS", "bos"],
    ["KC", "kc"],
    ["SF", "sf"],
    ["TB", "tb"],
    ["WSH", "wsh"],
  ];

  it.each(cases)("maps %s → %s", (input, expected) => {
    expect(getEspnMlbSlug(input)).toBe(expected);
  });

  it("is case-insensitive on input", () => {
    expect(getEspnMlbSlug("cws")).toBe("chw");
    expect(getEspnMlbSlug("az")).toBe("ari");
    expect(getEspnMlbSlug("nyy")).toBe("nyy");
  });

  it("trims whitespace", () => {
    expect(getEspnMlbSlug(" CWS ")).toBe("chw");
  });

  it("returns empty string for empty/blank input", () => {
    expect(getEspnMlbSlug("")).toBe("");
    expect(getEspnMlbSlug("   ")).toBe("");
  });

  it("passes unknown abbreviations through lowercased", () => {
    expect(getEspnMlbSlug("XYZ")).toBe("xyz");
  });
});
