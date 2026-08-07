import { describe, it, expect } from "vitest";
import {
  experienceBucket,
  draftCapitalBucket,
  situationBucket,
  roleBucket,
} from "@/utils/backtestArchetypes";

describe("experienceBucket", () => {
  it("maps years 1/2/3 and everything after to veteran", () => {
    expect(experienceBucket(1)).toBe("year_1");
    expect(experienceBucket(2)).toBe("year_2");
    expect(experienceBucket(3)).toBe("year_3");
    expect(experienceBucket(4)).toBe("veteran");
    expect(experienceBucket(12)).toBe("veteran");
  });

  it("returns null for unknown entry years instead of guessing", () => {
    expect(experienceBucket(null)).toBeNull();
    expect(experienceBucket(0)).toBeNull();
  });
});

describe("draftCapitalBucket (NFL draft round - NOT ADP)", () => {
  it("groups per the spec with round 3 kept separate, UDFA in day3", () => {
    expect(draftCapitalBucket(1)).toBe("rounds_1_2");
    expect(draftCapitalBucket(2)).toBe("rounds_1_2");
    expect(draftCapitalBucket(3)).toBe("round_3");
    expect(draftCapitalBucket(4)).toBe("day3_udfa");
    expect(draftCapitalBucket(7)).toBe("day3_udfa");
    expect(draftCapitalBucket(null)).toBe("day3_udfa"); // undrafted
  });
});

describe("situationBucket", () => {
  it("splits new-team vs same-team and excludes unknowns", () => {
    expect(situationBucket(true)).toBe("new_team");
    expect(situationBucket(false)).toBe("same_team");
    expect(situationBucket(null)).toBeNull(); // rookie / pre-window
  });
});

describe("roleBucket (Phase 4 fast-follow)", () => {
  it("stays null until snap-share data is ingested", () => {
    expect(roleBucket(null)).toBeNull();
  });
  it("splits bell-cow at 60% snap share once data exists", () => {
    expect(roleBucket(0.6)).toBe("bell_cow");
    expect(roleBucket(0.59)).toBe("committee");
  });
});
