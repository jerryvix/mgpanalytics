import { describe, it, expect } from "vitest";
import { spearman, phi } from "@/utils/backtestCorrelation";

describe("spearman", () => {
  it("returns 1 for a perfectly monotone relationship", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [1, 8, 27, 64])).toBeCloseTo(1); // nonlinear but monotone
  });

  it("returns -1 for a perfectly inverse relationship", () => {
    expect(spearman([1, 2, 3], [9, 5, 1])).toBeCloseTo(-1);
  });

  it("matches a hand-computed mixed case", () => {
    // xs ranks: [1,2,3,4,5]; ys = [2,1,4,3,5] -> ys ranks: [2,1,4,3,5]
    // d = [-1,1,-1,1,0], sum d^2 = 4; rho = 1 - 6*4/(5*24) = 0.8
    expect(spearman([10, 20, 30, 40, 50], [2, 1, 4, 3, 5])).toBeCloseTo(0.8);
  });

  it("averages ranks over ties (hand-computed)", () => {
    // xs = [1,2,2,4] -> ranks [1, 2.5, 2.5, 4]; ys strictly increasing
    // Pearson over ([1,2.5,2.5,4],[1,2,3,4]) = 3/sqrt(4.5*5) ~= 0.94868
    expect(spearman([1, 2, 2, 4], [5, 6, 7, 8])).toBeCloseTo(0.94868, 4);
  });

  it("refuses tiny or degenerate inputs", () => {
    expect(spearman([1, 2], [1, 2])).toBeNull(); // n < 3
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull(); // constant series
    expect(spearman([1, 2, 3], [1, 2])).toBeNull(); // length mismatch
  });
});

describe("phi", () => {
  it("matches a hand-computed 2x2 table", () => {
    // a=30 b=10 c=10 d=30: phi = (900-100)/sqrt(40*40*40*40) = 800/1600 = 0.5
    expect(phi(30, 10, 10, 30)).toBeCloseTo(0.5);
  });

  it("is 0 for independence and null for an empty margin", () => {
    expect(phi(20, 20, 20, 20)).toBeCloseTo(0);
    expect(phi(5, 5, 0, 0)).toBeNull();
  });

  it("is negative when the diagonal flips", () => {
    expect(phi(10, 30, 30, 10)).toBeCloseTo(-0.5);
  });
});
