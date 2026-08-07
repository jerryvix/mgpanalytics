import { describe, it, expect } from "vitest";
import {
  classifyTrend,
  classifyMomentum,
  getFantasyPosGroup,
  normalizePlayerName,
} from "@/utils/fantasyTrends";

describe("classifyTrend", () => {
  it("returns insufficient for fewer than two ranked seasons", () => {
    expect(classifyTrend([])).toBe("insufficient");
    expect(classifyTrend([{ season: 2025, rank: 5 }])).toBe("insufficient");
  });

  it("classifies a clear ascending trajectory (James Cook pattern)", () => {
    // The spec's canonical example: RB13 -> RB8 -> RB6
    expect(
      classifyTrend([
        { season: 2023, rank: 13 },
        { season: 2024, rank: 8 },
        { season: 2025, rank: 6 },
      ])
    ).toBe("ascending");
    // His real finishes: RB12 -> RB8 -> RB6 must also read ascending —
    // top-of-ranks moves are big in ratio terms even when small in spots
    expect(
      classifyTrend([
        { season: 2023, rank: 12 },
        { season: 2024, rank: 8 },
        { season: 2025, rank: 6 },
      ])
    ).toBe("ascending");
  });

  it("classifies a clear descending trajectory", () => {
    expect(
      classifyTrend([
        { season: 2023, rank: 4 },
        { season: 2024, rank: 10 },
        { season: 2025, rank: 18 },
      ])
    ).toBe("descending");
  });

  it("classifies small movements as flat", () => {
    expect(
      classifyTrend([
        { season: 2023, rank: 10 },
        { season: 2024, rank: 12 },
        { season: 2025, rank: 11 },
      ])
    ).toBe("flat");
  });

  it("treats back-of-the-pack drift as flat, not ascending", () => {
    // 8 spots of "improvement" that never leaves the waiver wire
    expect(
      classifyTrend([
        { season: 2023, rank: 44 },
        { season: 2024, rank: 40 },
        { season: 2025, rank: 36 },
      ])
    ).toBe("flat");
  });

  it("scores moves as rank ratios (two-season boundary cases)", () => {
    // Single move counts double: 15 -> 10 (1.5x) clears the bar, 12 -> 10 doesn't
    expect(classifyTrend([{ season: 2024, rank: 15 }, { season: 2025, rank: 10 }])).toBe("ascending");
    expect(classifyTrend([{ season: 2024, rank: 12 }, { season: 2025, rank: 10 }])).toBe("flat");
    expect(classifyTrend([{ season: 2024, rank: 10 }, { season: 2025, rank: 15 }])).toBe("descending");
    expect(classifyTrend([{ season: 2024, rank: 10 }, { season: 2025, rank: 12 }])).toBe("flat");
  });

  it("weights the most recent move 2x", () => {
    // prior: 24 -> 12 (big up), recent: 12 -> 14 (slip) => recency drags it to flat
    expect(
      classifyTrend([
        { season: 2023, rank: 24 },
        { season: 2024, rank: 12 },
        { season: 2025, rank: 14 },
      ])
    ).toBe("flat");
  });

  it("skips gap seasons rather than interpolating", () => {
    // Missing 2024: delta computed 2023 -> 2025 directly
    expect(
      classifyTrend([
        { season: 2023, rank: 20 },
        { season: 2025, rank: 8 },
      ])
    ).toBe("ascending");
  });

  it("only considers the last three ranked seasons", () => {
    // Early collapse (2021 rank 1 -> 2022 rank 30) is outside the window
    expect(
      classifyTrend([
        { season: 2021, rank: 1 },
        { season: 2022, rank: 30 },
        { season: 2023, rank: 28 },
        { season: 2024, rank: 24 },
        { season: 2025, rank: 20 },
      ])
    ).toBe("ascending");
  });
});

describe("classifyMomentum", () => {
  it("returns insufficient without ranks or with under 4 second-half games", () => {
    expect(classifyMomentum(null, 5, 8)).toBe("insufficient");
    expect(classifyMomentum(10, null, 8)).toBe("insufficient");
    expect(classifyMomentum(10, 5, null)).toBe("insufficient");
    expect(classifyMomentum(10, 5, 3)).toBe("insufficient");
  });

  it("accepts exactly 4 second-half games", () => {
    expect(classifyMomentum(10, 4, 4)).toBe("strong_closer");
  });

  it("flags a strong closer at a 6-spot improvement", () => {
    expect(classifyMomentum(18, 12, 9)).toBe("strong_closer");
    expect(classifyMomentum(18, 13, 9)).toBe("steady");
  });

  it("flags a fade at a 6-spot decline", () => {
    expect(classifyMomentum(6, 12, 9)).toBe("faded");
    expect(classifyMomentum(6, 11, 9)).toBe("steady");
  });

  it("classifies small differences as steady", () => {
    expect(classifyMomentum(10, 10, 9)).toBe("steady");
  });
});

describe("getFantasyPosGroup", () => {
  it("maps full names and abbreviations", () => {
    expect(getFantasyPosGroup("Quarterback")).toBe("QB");
    expect(getFantasyPosGroup("QB")).toBe("QB");
    expect(getFantasyPosGroup("Running Back")).toBe("RB");
    expect(getFantasyPosGroup("Fullback")).toBe("RB");
    expect(getFantasyPosGroup("Wide Receiver")).toBe("WR");
    expect(getFantasyPosGroup("Tight End")).toBe("TE");
  });

  it("returns null for non-fantasy positions", () => {
    expect(getFantasyPosGroup("Linebacker")).toBeNull();
    expect(getFantasyPosGroup("")).toBeNull();
    expect(getFantasyPosGroup(null)).toBeNull();
  });
});

describe("normalizePlayerName", () => {
  it("strips punctuation and suffixes for cross-source matching", () => {
    expect(normalizePlayerName("A.J. Brown")).toBe("aj brown");
    expect(normalizePlayerName("AJ Brown")).toBe("aj brown");
    expect(normalizePlayerName("Marvin Harrison Jr.")).toBe("marvin harrison");
    expect(normalizePlayerName("Ja'Marr Chase")).toBe("jamarr chase");
    expect(normalizePlayerName("Amon-Ra St. Brown")).toBe("amonra st brown");
  });
});
