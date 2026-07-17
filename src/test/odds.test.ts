import { describe, it, expect } from "vitest";
import {
  americanToImpliedProb,
  impliedPair,
  probToAmerican,
  consensusAmerican,
  consensusPriceMove,
} from "@/lib/odds";

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

describe("probToAmerican", () => {
  it("round-trips with americanToImpliedProb", () => {
    for (const price of [-110, -200, -550, +100, +150, +200, +1400]) {
      expect(probToAmerican(americanToImpliedProb(price)!)).toBe(price === +100 ? -100 : price);
    }
  });

  it("never produces an illegal price inside ±100", () => {
    for (let p = 0.02; p < 0.99; p += 0.01) {
      const price = probToAmerican(p)!;
      expect(Math.abs(price)).toBeGreaterThanOrEqual(100);
    }
  });

  it("returns null for out-of-range input", () => {
    expect(probToAmerican(0)).toBeNull();
    expect(probToAmerican(1)).toBeNull();
    expect(probToAmerican(-0.2)).toBeNull();
    expect(probToAmerican(null)).toBeNull();
    expect(probToAmerican(NaN)).toBeNull();
  });
});

describe("consensusAmerican", () => {
  it("returns a legal price when books straddle even money", () => {
    // Arithmetic mean of -118 and +102 would be an impossible "-8";
    // probability-space consensus stays legal.
    const price = consensusAmerican([-118, +102])!;
    expect(Math.abs(price)).toBeGreaterThanOrEqual(100);
  });

  it("matches the single book when only one price exists", () => {
    expect(consensusAmerican([-136, null, undefined])).toBe(-136);
  });

  it("returns null with no usable prices", () => {
    expect(consensusAmerican([null, undefined, 0])).toBeNull();
    expect(consensusAmerican([])).toBeNull();
  });
});

describe("consensusPriceMove", () => {
  it("reports a steamed favorite as a positive move", () => {
    // -112 → -136 across books: price shortening = money on this side.
    const m = consensusPriceMove([
      { open: -112, current: -135 },
      { open: -110, current: -138 },
      { open: -115, current: -134 },
    ])!;
    expect(m.books).toBe(3);
    expect(m.move).toBeGreaterThan(0);
    expect(m.open).toBeLessThanOrEqual(-100);
    expect(m.current).toBeLessThan(m.open); // more negative = shorter price
    expect(Math.abs(m.open)).toBeGreaterThanOrEqual(100);
    expect(Math.abs(m.current)).toBeGreaterThanOrEqual(100);
  });

  it("reports a drifting side as a negative move", () => {
    const m = consensusPriceMove([{ open: -120, current: +105 }])!;
    expect(m.move).toBeLessThan(0);
  });

  it("stays legal when books disagree across the ±100 boundary", () => {
    // This exact shape produced "-34.7 → +16" under arithmetic averaging.
    const m = consensusPriceMove([
      { open: -125, current: +110 },
      { open: +105, current: +120 },
      { open: -110, current: +102 },
    ])!;
    expect(Math.abs(m.open)).toBeGreaterThanOrEqual(100);
    expect(Math.abs(m.current)).toBeGreaterThanOrEqual(100);
  });

  it("skips books missing either end and nulls out when none remain", () => {
    const m = consensusPriceMove([
      { open: -110, current: -120 },
      { open: null, current: -140 },
      { open: -105, current: null },
    ])!;
    expect(m.books).toBe(1);
    expect(consensusPriceMove([{ open: null, current: -140 }])).toBeNull();
    expect(consensusPriceMove([])).toBeNull();
  });
});
