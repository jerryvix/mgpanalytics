import { describe, it, expect } from "vitest";
import { recordedOpen, resolveOpeningLine } from "../../supabase/functions/_shared/odds-open";

describe("odds_history opening line", () => {
  it("keeps the open recorded at first sight when a later capture comes in", () => {
    // Sep 24 2026 regression: PHI @ CHI, PHI moneyline opened -102 and was -225
    // at the first capture; the second snapshot stored -225 as the open.
    const firstRow = { opening_line: -102, current_line: -225 };
    expect(resolveOpeningLine(recordedOpen(firstRow), -102, -230)).toBe(-102);
  });

  it("does not let the book's open replace an open already on record", () => {
    expect(resolveOpeningLine(2.5, 3, 3)).toBe(2.5);
  });

  it("uses the book's open on first sight, else the sighting itself", () => {
    expect(resolveOpeningLine(undefined, -7.5, -4.5)).toBe(-7.5);
    expect(resolveOpeningLine(null, null, -4.5)).toBe(-4.5);
  });

  it("reads a pre-ESPN row with no stored open as opening at its own line", () => {
    expect(recordedOpen({ opening_line: null, current_line: 44.5 })).toBe(44.5);
    expect(recordedOpen({ opening_line: 46.5, current_line: 42.5 })).toBe(46.5);
  });
});
