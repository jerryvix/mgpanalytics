import { describe, it, expect } from "vitest";
import {
  summarizeLines,
  summarizeAdp,
  classifyAdpOutcome,
  adpSpotDelta,
  inAdpUniverse,
  isHealthySeason,
  propMissMagnitude,
  winTotalMissMagnitude,
  adpMissMagnitude,
  type GradedLine,
  type AdpRow,
} from "@/utils/backtestMetrics";

const line = (result: GradedLine["result"], overrides: Partial<GradedLine> = {}): GradedLine => ({
  result,
  line: 10,
  actual: result === "over" ? 12 : result === "under" ? 8 : result === "push" ? 10 : null,
  overOdds: null,
  underOdds: null,
  ...overrides,
});

describe("summarizeLines push handling", () => {
  it("excludes pushes from the hit-rate denominator and counts them separately", () => {
    const s = summarizeLines([line("over"), line("over"), line("under"), line("push")]);
    expect(s.graded).toBe(3); // push NOT in the denominator
    expect(s.pushes).toBe(1);
    expect(s.overRate).toBeCloseTo(2 / 3);
  });

  it("keeps ungraded rows out of every rate", () => {
    const s = summarizeLines([line("over"), line("ungraded")]);
    expect(s.graded).toBe(1);
    expect(s.ungraded).toBe(1);
    expect(s.overRate).toBe(1);
  });

  it("returns null rates on an empty slate instead of NaN", () => {
    const s = summarizeLines([line("push")]);
    expect(s.overRate).toBeNull();
    expect(s.graded).toBe(0);
    expect(s.pushes).toBe(1);
  });

  it("computes absolute error including pushes (error 0)", () => {
    const s = summarizeLines([
      line("over", { line: 100, actual: 110 }),
      line("push", { line: 100, actual: 100 }),
    ]);
    expect(s.meanAbsError).toBeCloseTo(5);
    expect(s.meanAbsErrorPct).toBeCloseTo(0.05);
  });

  it("tracks the no-vig favored side, skipping juice-tied lines", () => {
    const s = summarizeLines([
      // over favored (-130/+110), over hit
      line("over", { overOdds: -130, underOdds: 110 }),
      // under favored (-120/+100 equivalent), over hit -> favored side missed
      line("over", { overOdds: 100, underOdds: -120 }),
      // dead-even juice -> no favored side, excluded
      line("under", { overOdds: -110, underOdds: -110 }),
    ]);
    expect(s.favoredSideSample).toBe(2);
    expect(s.favoredSideHitRate).toBeCloseTo(0.5);
  });
});

describe("ADP semantics", () => {
  it("applies the positional universe cutoffs", () => {
    expect(inAdpUniverse({ position: "QB", adpPosRank: 24 })).toBe(true);
    expect(inAdpUniverse({ position: "QB", adpPosRank: 25 })).toBe(false);
    expect(inAdpUniverse({ position: "WR", adpPosRank: 60 })).toBe(true);
    expect(inAdpUniverse({ position: "K", adpPosRank: 1 })).toBe(false);
  });

  it("classifies beat / met / bust / dnp on spot deltas, not ratios", () => {
    const row = (adp: number, finish: number | null, position = "WR"): AdpRow => ({
      position,
      adpPosRank: adp,
      finishPosRank: finish,
      games: 17,
    });
    // WR bust threshold = round(60 * 0.25) = 15 spots
    expect(classifyAdpOutcome(row(10, 10))).toBe("beat"); // at slot = beat
    expect(classifyAdpOutcome(row(10, 4))).toBe("beat"); // better than slot
    expect(classifyAdpOutcome(row(10, 24))).toBe("met"); // fell 14, under threshold
    expect(classifyAdpOutcome(row(10, 25))).toBe("bust"); // fell 15, at threshold
    expect(classifyAdpOutcome(row(10, null))).toBe("dnp");
    // The case the old 2x-ratio rule got wrong: WR1 finishing WR4 is a
    // trivial 3-spot miss, nowhere near a bust, even though 4 > 2*1.
    expect(classifyAdpOutcome(row(1, 4))).toBe("met");
    // Thresholds are position-relative: a QB1 finishing QB8 (7 spots, QB
    // threshold 6) IS a bust, even though 7 spots would be "met" for a WR.
    expect(classifyAdpOutcome(row(1, 8, "QB"))).toBe("bust");
  });

  it("computes the signed spot delta (positive = beat ADP)", () => {
    expect(adpSpotDelta({ position: "RB", adpPosRank: 12, finishPosRank: 6, games: 17 })).toBe(6);
    expect(adpSpotDelta({ position: "RB", adpPosRank: 6, finishPosRank: 12, games: 17 })).toBe(-6);
    expect(adpSpotDelta({ position: "RB", adpPosRank: 6, finishPosRank: null, games: 0 })).toBeNull();
  });

  it("counts dnp in bust rate but not in the mean spot delta", () => {
    const rows: AdpRow[] = [
      { position: "RB", adpPosRank: 5, finishPosRank: 3, games: 17 }, // beat, +2
      { position: "RB", adpPosRank: 10, finishPosRank: null, games: 0 }, // dnp
    ];
    const s = summarizeAdp(rows);
    expect(s.sample).toBe(2);
    expect(s.bust).toBe(1); // the dnp
    expect(s.dnp).toBe(1);
    expect(s.bustRate).toBeCloseTo(0.5);
    expect(s.meanSpotDelta).toBeCloseTo(2); // dnp excluded
  });

  it("filters to the universe before summarizing", () => {
    const s = summarizeAdp([
      { position: "TE", adpPosRank: 21, finishPosRank: 1, games: 17 }, // outside TE20
    ]);
    expect(s.sample).toBe(0);
    expect(s.bustRate).toBeNull();
  });
});

describe("isHealthySeason era boundary", () => {
  it("uses 14+ games from 2021 (17-game era) and 13+ before", () => {
    expect(isHealthySeason(14, 2021)).toBe(true);
    expect(isHealthySeason(13, 2021)).toBe(false);
    expect(isHealthySeason(13, 2020)).toBe(true);
    expect(isHealthySeason(12, 2020)).toBe(false);
    expect(isHealthySeason(null, 2024)).toBe(false);
  });

  it("is deliberately stricter than the ranks view's games >= 6 PPG floor", () => {
    // A 10-game season has a real PPG but is injury-shaped
    expect(isHealthySeason(10, 2024)).toBe(false);
  });
});

describe("miss magnitudes", () => {
  it("props are relative, win totals absolute, ADP is absolute spot count", () => {
    expect(propMissMagnitude({ actual: 3000, line: 4000 })).toBeCloseTo(0.25);
    expect(winTotalMissMagnitude({ actual: 4, line: 9.5 })).toBeCloseTo(5.5);
    expect(adpMissMagnitude({ position: "WR", adpPosRank: 6, finishPosRank: 24, games: 17 })).toBe(18);
    expect(propMissMagnitude({ actual: null, line: 4000 })).toBeNull();
  });
});
