import { describe, it, expect } from "vitest";
import {
  classifyContinuity,
  continuityScore,
  continuityEdge,
  classifyH2H,
  talentPoints,
  classifyTalentEdge,
  compositeVerdict,
  type H2HGameRow,
} from "@/utils/matchupIntel";

describe("classifyContinuity", () => {
  it("returns insufficient without a returning-PPA number", () => {
    expect(classifyContinuity({ percentPpa: null, netPortal: 5, draftDepartures: 0 })).toBe("insufficient");
    expect(classifyContinuity({ percentPpa: NaN, netPortal: 0, draftDepartures: 0 })).toBe("insufficient");
  });

  it("classifies the bands with exact boundaries", () => {
    expect(classifyContinuity({ percentPpa: 65, netPortal: 0, draftDepartures: 0 })).toBe("intact");
    expect(classifyContinuity({ percentPpa: 64.9, netPortal: 0, draftDepartures: 0 })).toBe("retooled");
    expect(classifyContinuity({ percentPpa: 40, netPortal: 0, draftDepartures: 0 })).toBe("retooled");
    expect(classifyContinuity({ percentPpa: 39.9, netPortal: 0, draftDepartures: 0 })).toBe("rebuilt");
  });
});

describe("continuityScore / continuityEdge", () => {
  it("nudges by net portal and dings draft departures 2x", () => {
    expect(continuityScore({ percentPpa: 60, netPortal: 4, draftDepartures: 3 })).toBe(58);
    expect(continuityScore({ percentPpa: 60, netPortal: null, draftDepartures: null })).toBe(60);
    expect(continuityScore({ percentPpa: null, netPortal: 4, draftDepartures: 0 })).toBeNull();
  });

  it("requires a 12-point gap to call an edge", () => {
    const strong = { percentPpa: 70, netPortal: 0, draftDepartures: 0 };
    const weak = { percentPpa: 58, netPortal: 0, draftDepartures: 0 };
    const close = { percentPpa: 59, netPortal: 0, draftDepartures: 0 };
    expect(continuityEdge(strong, weak)).toBe("home");
    expect(continuityEdge(weak, strong)).toBe("away");
    expect(continuityEdge(strong, close)).toBe("even");
  });

  it("is insufficient when either side lacks data", () => {
    const known = { percentPpa: 70, netPortal: 0, draftDepartures: 0 };
    const unknown = { percentPpa: null, netPortal: 0, draftDepartures: 0 };
    expect(continuityEdge(known, unknown)).toBe("insufficient");
    expect(continuityEdge(unknown, known)).toBe("insufficient");
  });
});

const meeting = (
  season: number,
  home: string,
  hp: number,
  away: string,
  ap: number
): H2HGameRow => ({
  season,
  date: `${season}-11-20`,
  home_school: home,
  home_points: hp,
  away_school: away,
  away_points: ap,
});

describe("classifyH2H", () => {
  it("is insufficient with fewer than two meetings", () => {
    expect(classifyH2H([], "Alabama", "Auburn").verdict).toBe("insufficient");
    expect(
      classifyH2H([meeting(2025, "Auburn", 20, "Alabama", 27)], "Alabama", "Auburn").verdict
    ).toBe("insufficient");
  });

  it("detects series ownership and the streak (won each of last five)", () => {
    const games = [2021, 2022, 2023, 2024, 2025].map((s) =>
      meeting(s, s % 2 ? "Alabama" : "Auburn", s % 2 ? 30 : 17, s % 2 ? "Auburn" : "Alabama", s % 2 ? 17 : 30)
    );
    // Alabama wins every meeting regardless of venue
    const summary = classifyH2H(games, "Alabama", "Auburn");
    expect(summary.verdict).toBe("team1_owns");
    expect(summary.team1Wins).toBe(5);
    expect(summary.team2Wins).toBe(0);
    expect(summary.streak).toEqual({ school: "Alabama", count: 5 });
  });

  it("mirrors ownership to team2 and calls near-even series split", () => {
    const sweep = [
      meeting(2024, "Ohio State", 10, "Michigan", 13),
      meeting(2025, "Michigan", 21, "Ohio State", 14),
    ];
    expect(classifyH2H(sweep, "Ohio State", "Michigan").verdict).toBe("team2_owns");

    const split = [
      meeting(2022, "Ohio State", 45, "Michigan", 23),
      meeting(2023, "Michigan", 30, "Ohio State", 24),
      meeting(2024, "Ohio State", 10, "Michigan", 13),
      meeting(2025, "Michigan", 21, "Ohio State", 38),
    ];
    const summary = classifyH2H(split, "Ohio State", "Michigan");
    expect(summary.verdict).toBe("split");
    expect(summary.team1Wins).toBe(2);
    expect(summary.team2Wins).toBe(2);
  });

  it("only reports streaks of two or more", () => {
    const games = [
      meeting(2024, "Texas", 20, "Oklahoma", 24),
      meeting(2025, "Oklahoma", 17, "Texas", 34),
    ];
    expect(classifyH2H(games, "Texas", "Oklahoma").streak).toBeNull();
  });
});

describe("talentPoints / classifyTalentEdge", () => {
  const fresh = new Date("2026-11-01T00:00:00Z");
  const capturedFresh = "2026-10-25T00:00:00Z"; // 7 days old
  const capturedStale = "2026-10-01T00:00:00Z"; // 31 days old

  it("weights board tiers 3/2/1", () => {
    expect(talentPoints([1, 15, 16, 50, 51, 101])).toBe(3 + 3 + 2 + 2 + 1 + 1);
    expect(talentPoints([])).toBe(0);
  });

  it("is insufficient on a missing or stale board, even with prospects", () => {
    expect(classifyTalentEdge([1, 2], [], null, fresh).lean).toBe("insufficient");
    expect(classifyTalentEdge([1, 2], [], capturedStale, fresh).lean).toBe("insufficient");
  });

  it("calls the edge at a 3-point gap on a fresh board", () => {
    expect(classifyTalentEdge([10], [], capturedFresh, fresh).lean).toBe("home"); // 3-0
    expect(classifyTalentEdge([], [60], capturedFresh, fresh).lean).toBe("even"); // 0-1
    expect(classifyTalentEdge([60], [12, 40], capturedFresh, fresh).lean).toBe("away"); // 1-5
  });

  it("treats a fresh board with no prospects on either side as a real even", () => {
    const result = classifyTalentEdge([], [], capturedFresh, fresh);
    expect(result.lean).toBe("even");
    expect(result.homePoints).toBe(0);
  });
});

describe("compositeVerdict", () => {
  it("is insufficient when every signal is", () => {
    expect(
      compositeVerdict({ continuity: "insufficient", talent: "insufficient", h2h: "insufficient" })
    ).toEqual({ lean: "insufficient", score: null, signalsUsed: 0 });
  });

  it("renormalizes when signals drop out — lone continuity signal reads full-strength", () => {
    const result = compositeVerdict({ continuity: "home", talent: "insufficient", h2h: "insufficient" });
    expect(result.lean).toBe("home");
    expect(result.score).toBe(1);
    expect(result.signalsUsed).toBe(1);
  });

  it("weights continuity heaviest — it outvotes talent and h2h combined", () => {
    const result = compositeVerdict({ continuity: "home", talent: "away", h2h: "away" });
    // (0.5 - 0.3 - 0.2) / 1 = 0 → even, not away: continuity fully cancels both
    expect(result.lean).toBe("even");

    const withEvenH2h = compositeVerdict({ continuity: "home", talent: "away", h2h: "even" });
    // (0.5 - 0.3) / 1 = 0.2 → still shy of the 0.25 lean threshold
    expect(withEvenH2h.lean).toBe("even");

    const backed = compositeVerdict({ continuity: "home", talent: "even", h2h: "even" });
    // 0.5 / 1 = 0.5 → home
    expect(backed.lean).toBe("home");
  });

  it("calls away leans symmetrically", () => {
    const result = compositeVerdict({ continuity: "away", talent: "home", h2h: "insufficient" });
    // (-0.5 + 0.3) / 0.8 = -0.25 → away (boundary inclusive)
    expect(result.lean).toBe("away");
    expect(result.signalsUsed).toBe(2);
  });
});
