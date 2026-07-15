import { describe, it, expect } from "vitest";
import { americanToImpliedProb, impliedPair } from "@/lib/odds";

describe("americanToImpliedProb", () => {
  const cases: Array<[price: number, expected: number]> = [
    [-110, 0.5238],
    [+150, 0.4],
    [-200, 0.6667],
    [+200, 0.3333],
    [+100, 0.5],
    [-100, 0.5],
    [-550, 0.8462], // heavy favorite
    [+1400, 0.0667], // longshot
  ];

  it.each(cases)("%d → %f", (price, expected) => {
    expect(americanToImpliedProb(price)).toBeCloseTo(expected, 3);
  });

  it("returns null for null/undefined/0/non-finite", () => {
    expect(americanToImpliedProb(null)).toBeNull();
    expect(americanToImpliedProb(undefined)).toBeNull();
    expect(americanToImpliedProb(0)).toBeNull();
    expect(americanToImpliedProb(NaN)).toBeNull();
    expect(americanToImpliedProb(Infinity)).toBeNull();
  });
});

describe("impliedPair", () => {
  it("splits a pick'em evenly", () => {
    const p = impliedPair(-110, -110)!;
    expect(p.home).toBeCloseTo(0.5, 5);
    expect(p.away).toBeCloseTo(0.5, 5);
  });

  it("always sums to 1 (vig removed)", () => {
    const p = impliedPair(-170, +150)!;
    expect(p.home + p.away).toBeCloseTo(1, 8);
    expect(p.home).toBeGreaterThan(p.away);
  });

  it("handles asymmetric prices", () => {
    // -200 raw = 0.6667, +170 raw = 0.3704; normalized home ≈ 0.6428
    const p = impliedPair(-200, +170)!;
    expect(p.home).toBeCloseTo(0.6428, 3);
    expect(p.away).toBeCloseTo(0.3572, 3);
  });

  it("favors the negative price side", () => {
    const p = impliedPair(+250, -300)!;
    expect(p.away).toBeGreaterThan(p.home);
  });

  it("returns null when either side is missing", () => {
    expect(impliedPair(-110, null)).toBeNull();
    expect(impliedPair(null, -110)).toBeNull();
    expect(impliedPair(null, null)).toBeNull();
    expect(impliedPair(0, -110)).toBeNull();
    expect(impliedPair(-110, undefined)).toBeNull();
  });
});
