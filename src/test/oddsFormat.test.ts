import { describe, expect, it } from "vitest";

import {
  MINUS,
  formatAmerican,
  formatAts,
  formatMovement,
  formatRecord,
  formatSpread,
  formatSpreadWithPrice,
  formatTeamSpread,
  formatTotal,
  formatTotalLine,
} from "../../packages/shared/odds/format";

// Owner rule (docs/mobile/DECISIONS.md D-039): all betting data reads the way sportsbooks show it.
const m = MINUS;

describe("odds formatting", () => {
  it("formats American prices with a sign", () => {
    expect(formatAmerican(-110)).toBe(`${m}110`);
    expect(formatAmerican(200)).toBe("+200");
    expect(formatAmerican(100)).toBe("+100");
    expect(formatAmerican(null)).toBe("");
  });

  it("formats spreads, including pick'em and whole numbers", () => {
    expect(formatSpread(-6.5)).toBe(`${m}6.5`);
    expect(formatSpread(6.5)).toBe("+6.5");
    expect(formatSpread(-3)).toBe(`${m}3`);
    expect(formatSpread(0)).toBe("PK");
  });

  it("puts the price in parentheses after the spread", () => {
    expect(formatSpreadWithPrice(-6.5, -110)).toBe(`${m}6.5 (${m}110)`);
    expect(formatSpreadWithPrice(6.5, null)).toBe("+6.5");
  });

  it("leads with the team name", () => {
    expect(formatTeamSpread("Oregon", -6.5)).toBe(`Oregon ${m}6.5`);
    expect(formatTeamSpread("Michigan State", 6.5)).toBe("Michigan State +6.5");
  });

  it("formats totals as O, U and O/U", () => {
    expect(formatTotal("over", 52.5)).toBe("O 52.5");
    expect(formatTotal("under", 52.5)).toBe("U 52.5");
    expect(formatTotalLine(47)).toBe("O/U 47");
  });

  it("shows movement from open to now", () => {
    expect(formatMovement(-4.5, -6.5)).toBe(`${m}4.5 → ${m}6.5`);
    expect(formatMovement(null, -6.5)).toBe("");
  });

  it("formats records and ATS records", () => {
    expect(formatRecord(5, 5)).toBe("5-5");
    expect(formatRecord(5, 4, 1)).toBe("5-4-1");
    expect(formatAts(5, 5)).toBe("5-5 ATS");
  });
});
