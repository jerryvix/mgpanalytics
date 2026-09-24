import { describe, it, expect } from "vitest";
import {
  classifyContinuity,
  continuityScore,
  continuityEdge,
  classifyH2H,
  talentPoints,
  classifyTalentEdge,
  compositeVerdict,
  latestBoardRows,
  normalizeProspectName,
  type H2HGameRow,
} from "@/utils/matchupIntel";

describe("classifyContinuity", () => {
  it("returns insufficient without a returning-PPA number", () => {
    expect(classifyContinuity({ percentPpa: null, portalIn: 5 })).toBe("insufficient");
    expect(classifyContinuity({ percentPpa: NaN, portalIn: 0 })).toBe("insufficient");
  });

  it("classifies the bands with exact boundaries", () => {
    expect(classifyContinuity({ percentPpa: 65, portalIn: 0 })).toBe("intact");
    expect(classifyContinuity({ percentPpa: 64.9, portalIn: 0 })).toBe("retooled");
    expect(classifyContinuity({ percentPpa: 40, portalIn: 0 })).toBe("retooled");
    expect(classifyContinuity({ percentPpa: 39.9, portalIn: 0 })).toBe("rebuilt");
  });
});

describe("continuityScore / continuityEdge", () => {
  it("adds half a point per incoming transfer, capped at +10", () => {
    expect(continuityScore({ percentPpa: 60, portalIn: 4 })).toBe(62);
    expect(continuityScore({ percentPpa: 60, portalIn: 40 })).toBe(70); // cap
    expect(continuityScore({ percentPpa: 60, portalIn: null })).toBe(60);
    expect(continuityScore({ percentPpa: null, portalIn: 4 })).toBeNull();
  });

  it("does not re-penalize departures - they're already in returning PPA", () => {
    // A 72%-returning powerhouse that sent 6 players to the NFL must not
    // score below a 76%-returning team: the drafted production is already
    // excluded from the 72%.
    const texas = { percentPpa: 72, portalIn: 22 };
    const texasState = { percentPpa: 76, portalIn: 17 };
    expect(continuityEdge(texas, texasState)).toBe("even");
  });

  it("requires a 12-point gap to call an edge", () => {
    const strong = { percentPpa: 70, portalIn: 0 };
    const weak = { percentPpa: 57, portalIn: 0 };
    const close = { percentPpa: 59, portalIn: 0 };
    expect(continuityEdge(strong, weak)).toBe("home");
    expect(continuityEdge(weak, strong)).toBe("away");
    expect(continuityEdge(strong, close)).toBe("even");
  });

  it("is insufficient when either side lacks data", () => {
    const known = { percentPpa: 70, portalIn: 0 };
    const unknown = { percentPpa: null, portalIn: 0 };
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

  it("weights top-100 tiers 3/2/1", () => {
    expect(talentPoints([1, 15, 16, 50, 51, 100])).toBe(3 + 3 + 2 + 2 + 1 + 1);
    expect(talentPoints([])).toBe(0);
  });

  it("counts ranks 101-200 at half a point, capped at 2 per team, and ignores anything deeper", () => {
    expect(talentPoints([101, 200])).toBe(1);
    expect(talentPoints([120, 140, 160, 180])).toBe(2);
    expect(talentPoints(Array(10).fill(180))).toBe(2); // the cap, not 10 (or 5)
    expect(talentPoints([201, 250, 300])).toBe(0);
    expect(talentPoints([5, ...Array(8).fill(150)])).toBe(3 + 2);
  });

  it("never lets a pile of Day 3 names outscore real first-round talent", () => {
    const tenLateRounders = Array(10).fill(180);
    const twoTopTen = [3, 9];
    // 6 vs 2: the top-10 side gets the edge (the old 1-per-spot rule gave 6 vs 10 the other way)
    expect(classifyTalentEdge(twoTopTen, tenLateRounders, capturedFresh, fresh).lean).toBe("home");
    expect(classifyTalentEdge(tenLateRounders, twoTopTen, capturedFresh, fresh).lean).toBe("away");
    // Depth alone (max 2) can never open the 3-point gap an edge needs
    expect(classifyTalentEdge(Array(20).fill(150), [], capturedFresh, fresh).lean).toBe("even");
  });

  it("keeps real-board matchups honest: Day 3 depth doesn't erase or invent a top-100 edge", () => {
    // Week 4 matchups on DraftTek's Sep 17 2026 top 200
    const georgia = [11, 12, 43, 81, 131, 144, 162];
    const oklahoma = [9, 78, 104, 132, 136, 141, 152, 165, 183, 198];
    expect(talentPoints(georgia)).toBe(10.5);
    expect(talentPoints(oklahoma)).toBe(6); // 1-per-spot scoring had these two tied 12-12
    expect(classifyTalentEdge(georgia, oklahoma, capturedFresh, fresh).lean).toBe("home");

    const michigan = [65, 110, 116, 142, 160, 174, 185];
    const iowa = [41, 67, 89];
    // 1-per-spot scoring handed Michigan a 7-4 edge built on six Day 3 names
    expect(classifyTalentEdge(michigan, iowa, capturedFresh, fresh).lean).toBe("even"); // 3-4
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

  it("judges age by the source's own revision date, which a daily re-scrape can't refresh", () => {
    // Scraped this morning, but DraftTek last revised 25 days ago: dormant
    const now = new Date("2026-10-12T12:00:00Z");
    expect(classifyTalentEdge([10], [], "2026-09-17", now).lean).toBe("insufficient");
    expect(classifyTalentEdge([10], [], "2026-10-08", now).lean).toBe("home");
  });
});

describe("latestBoardRows (client guard against a mixed board)", () => {
  const oldCapture = "2026-09-19T05:00:14.19+00:00"; // Tankathon rows left behind by a failed prune
  const newCapture = "2026-09-26T05:00:02.5+00:00"; // DraftTek capture
  const r = (rank: number, player_name: string, school: string, captured_at: string) => ({
    rank,
    player_name,
    school,
    captured_at,
  });

  it("keeps only the newest capture, so a previous source's leftovers never count", () => {
    const rows = [
      r(11, "CJ Carr", "Notre Dame", oldCapture),
      r(22, "Tae Johnson", "Notre Dame", oldCapture),
      r(16, "Tae Johnson", "Notre Dame", newCapture),
      r(26, "C.J. Carr", "Notre Dame", newCapture),
    ];
    const board = latestBoardRows(rows);
    expect(board.map((p) => `${p.rank} ${p.player_name}`)).toEqual(["16 Tae Johnson", "26 C.J. Carr"]);
    expect(board.filter((p) => p.school === "Notre Dame")).toHaveLength(2); // not 4
  });

  it("de-duplicates a player listed twice under different punctuation, keeping the best rank", () => {
    const rows = [
      r(40, "C.J. Carr", "Notre Dame", newCapture),
      r(26, "CJ Carr", "Notre Dame", newCapture),
      r(90, "Kenyatta Jackson Jr.", "Ohio State", newCapture),
      r(25, "Kenyatta Jackson", "Ohio State", newCapture),
    ];
    expect(latestBoardRows(rows).map((p) => p.rank)).toEqual([25, 26]);
  });

  it("keeps two different players who share a name at different schools", () => {
    const rows = [r(150, "Daniel Harris", "California", newCapture), r(180, "Daniel Harris", "Duke", newCapture)];
    expect(latestBoardRows(rows)).toHaveLength(2);
  });

  it("normalizes names the way the dedupe needs", () => {
    expect(normalizeProspectName("C.J. Carr")).toBe(normalizeProspectName("CJ Carr"));
    expect(normalizeProspectName("A'Mauri Washington")).toBe("amauri washington");
    expect(normalizeProspectName("Ellis Robinson IV")).toBe("ellis robinson");
    expect(latestBoardRows([])).toEqual([]);
  });
});

describe("compositeVerdict", () => {
  it("is insufficient when every signal is", () => {
    expect(
      compositeVerdict({ continuity: "insufficient", talent: "insufficient", h2h: "insufficient" })
    ).toEqual({ lean: "insufficient", score: null, signalsUsed: 0 });
  });

  it("renormalizes when signals drop out - lone continuity signal reads full-strength", () => {
    const result = compositeVerdict({ continuity: "home", talent: "insufficient", h2h: "insufficient" });
    expect(result.lean).toBe("home");
    expect(result.score).toBe(1);
    expect(result.signalsUsed).toBe(1);
  });

  it("weights continuity heaviest - it outvotes talent and h2h combined", () => {
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
