import { describe, it, expect, vi } from "vitest";

// Mock supabase before any imports that use it
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
}));

// Mock matchup grader (used by propAnalysisHandler)
vi.mock("@/utils/matchupGrader", () => ({
  gradeProp: vi.fn(),
  getGradeColor: vi.fn(),
}));

// Mock advancedStatsCalculator (used by advancedStatsHandler and propAnalysisHandler)
vi.mock("@/utils/advancedStatsCalculator", () => ({
  calculateAdvancedStats: vi.fn(() => ({})),
}));

// Mock statDefinitions (used by advancedStatsHandler)
vi.mock("@/data/statDefinitions", () => ({
  QB_ADVANCED_STATS: [],
  RB_ADVANCED_STATS: [],
  WR_TE_ADVANCED_STATS: [],
  DEF_ADVANCED_STATS: [],
  getStatDefinitions: vi.fn(() => []),
}));

// Mock sharpMoneyDetector (used by publicBettingHandler)
vi.mock("@/utils/sharpMoneyDetector", () => ({
  detectSharpMoney: vi.fn(),
  formatBettingPercentages: vi.fn(),
  generateSharpSummary: vi.fn(),
}));

import { isNbaQuery, shouldExtractSpecificStat } from "@/services/chatbot/nbaQueryHandler";
import { shouldHandleNbaPropsQuery } from "@/services/chatbot/nbaPropsHandler";
import { isGameLogQuery, isVsTeamQuery, matchPlayerName, parseNFLStatsQuery } from "@/utils/playerNameMatcher";
import { isPublicBettingQuery } from "@/services/chatbot/publicBettingHandler";
import { shouldHandleAdvancedStats } from "@/services/chatbot/advancedStatsHandler";
import { shouldHandlePropAnalysis } from "@/services/chatbot/propAnalysisHandler";
import { shouldHandleNFLStats } from "@/services/chatbot/nflStatsHandler";

// ── NBA vs NFL detection ─────────────────────────────────────────────

describe("Query routing — NBA vs NFL detection", () => {
  it("routes LeBron James query to NBA", () => {
    expect(isNbaQuery("lebron james stats this season")).toBe(true);
  });

  it("does not route Josh Allen to NBA", () => {
    expect(isNbaQuery("josh allen passing yards")).toBe(false);
  });

  it("routes explicit NBA mention", () => {
    expect(isNbaQuery("nba games tonight")).toBe(true);
  });

  it("routes basketball keyword", () => {
    expect(isNbaQuery("basketball scores today")).toBe(true);
  });

  it("routes Lakers (NBA team alias)", () => {
    expect(isNbaQuery("what are the odds for lakers vs celtics")).toBe(true);
  });

  it("routes Curry by last name", () => {
    expect(isNbaQuery("how is curry shooting this year")).toBe(true);
  });

  it("detects Josh Allen as NFL stats query", () => {
    expect(shouldHandleNFLStats("josh allen passing yards")).toBe(true);
  });
});

// ── NBA props detection ──────────────────────────────────────────────

describe("Query routing — NBA props", () => {
  it("detects NBA props query", () => {
    expect(shouldHandleNbaPropsQuery("nba props tonight")).toBe(true);
  });

  it("detects player props query", () => {
    expect(shouldHandleNbaPropsQuery("lebron points prop")).toBe(true);
  });

  it("detects over/under query", () => {
    expect(shouldHandleNbaPropsQuery("over under for tatum")).toBe(true);
  });
});

// ── NBA specific stat extraction ─────────────────────────────────────

describe("Query routing — NBA specific stat extraction", () => {
  it("extracts three-point stat for Curry", () => {
    const result = shouldExtractSpecificStat("how many 3s does curry average");
    expect(result).not.toBeNull();
    expect(result!.stat).toBe("threes");
    expect(result!.playerName).toContain("curry");
  });

  it("extracts points for LeBron James", () => {
    const result = shouldExtractSpecificStat("lebron james points per game");
    expect(result).not.toBeNull();
    expect(result!.stat).toBe("points");
  });

  it("returns null for no player", () => {
    expect(shouldExtractSpecificStat("what is the weather")).toBeNull();
  });
});

// ── Market / betting queries ─────────────────────────────────────────

describe("Query routing — market/betting queries", () => {
  it("detects sharp money query", () => {
    expect(isPublicBettingQuery("where is the sharp money on bills vs chiefs")).toBe(true);
  });

  it("detects line movement query", () => {
    expect(isPublicBettingQuery("line movement on eagles game")).toBe(true);
  });

  it("does not match plain player query", () => {
    expect(isPublicBettingQuery("patrick mahomes passing yards")).toBe(false);
  });

  it("detects public betting percentage query", () => {
    expect(isPublicBettingQuery("betting percentages ravens vs steelers")).toBe(true);
  });

  it("detects public + action combination", () => {
    expect(isPublicBettingQuery("public action on the chiefs")).toBe(true);
  });
});

// ── Advanced stats ───────────────────────────────────────────────────

describe("Query routing — advanced stats", () => {
  it("detects EPA query", () => {
    expect(shouldHandleAdvancedStats("what's josh allen's epa")).toBe(true);
  });

  it("detects CPOE query", () => {
    expect(shouldHandleAdvancedStats("cpoe leaders this season")).toBe(true);
  });

  it("detects target share query", () => {
    expect(shouldHandleAdvancedStats("what is tyreek hill's target share")).toBe(true);
  });

  it("detects yards after contact", () => {
    expect(shouldHandleAdvancedStats("saquon barkley yards after contact")).toBe(true);
  });

  it("does not match generic query", () => {
    expect(shouldHandleAdvancedStats("who won last week")).toBe(false);
  });
});

// ── Prop analysis ────────────────────────────────────────────────────

describe("Query routing — prop analysis", () => {
  it("detects passing yards prop with line", () => {
    expect(shouldHandlePropAnalysis("mahomes over 275.5 passing yards")).toBe(true);
  });

  it("detects o/u prop", () => {
    expect(shouldHandlePropAnalysis("o/u 22.5 rushing yards")).toBe(true);
  });

  it("detects receiving yards prop", () => {
    expect(shouldHandlePropAnalysis("tyreek hill 85.5 receiving yards")).toBe(true);
  });

  it("does not match query without a number", () => {
    expect(shouldHandlePropAnalysis("tell me about mahomes props")).toBe(false);
  });
});

// ── Game logs and matchups ───────────────────────────────────────────

describe("Query routing — game logs and matchups", () => {
  it("detects last N games query", () => {
    expect(isGameLogQuery("josh allen last 5 games")).toBe(true);
  });

  it("detects recent games query", () => {
    expect(isGameLogQuery("recent games for mahomes")).toBe(true);
  });

  it("detects game log query", () => {
    expect(isGameLogQuery("show me the game log")).toBe(true);
  });

  it("detects vs team query", () => {
    expect(isVsTeamQuery("mahomes against the bills")).toBe(true);
  });

  it("detects vs abbreviation", () => {
    expect(isVsTeamQuery("allen vs chiefs")).toBe(true);
  });
});

// ── Player name matching ─────────────────────────────────────────────

describe("Player name matching", () => {
  it("matches full name: Josh Allen", () => {
    expect(matchPlayerName("tell me about josh allen")).toBe("josh allen");
  });

  it("matches full name: Lamar Jackson", () => {
    expect(matchPlayerName("what's lamar jackson's stats")).toBe("lamar jackson");
  });

  it("matches CeeDee Lamb variant", () => {
    expect(matchPlayerName("ceedee lamb receiving yards")).toBe("ceedee lamb");
  });

  it("matches Ja'Marr Chase variant", () => {
    expect(matchPlayerName("ja'marr chase targets")).toBe("ja'marr chase");
  });

  it("matches Travis Kelce", () => {
    expect(matchPlayerName("how is travis kelce doing")).toBe("travis kelce");
  });
});

// ── NFL stats query parsing ──────────────────────────────────────────

describe("NFL stats query parsing", () => {
  it("parses last N games query", () => {
    const result = parseNFLStatsQuery("josh allen last 3 games");
    expect(result.playerName).toBe("josh allen");
    expect(result.timeFrame).toBe("last_games");
    expect(result.gameCount).toBe(3);
  });

  it("parses season stats query", () => {
    const result = parseNFLStatsQuery("mahomes 2024 season stats");
    expect(result.playerName).toContain("mahomes");
    expect(result.timeFrame).toBe("season");
  });

  it("parses vs team query", () => {
    const result = parseNFLStatsQuery("mahomes against the bills");
    expect(result.timeFrame).toBe("vs_team");
    expect(result.teamFilter).toBe("BUF");
  });

  it("detects passing stat type", () => {
    const result = parseNFLStatsQuery("josh allen passing yards last 5 games");
    expect(result.statType).toBe("passing");
  });

  it("detects rushing stat type", () => {
    const result = parseNFLStatsQuery("saquon barkley rushing yards this season");
    expect(result.statType).toBe("rushing");
  });

  it("defaults to season timeframe for plain player query", () => {
    const result = parseNFLStatsQuery("patrick mahomes stats");
    expect(result.timeFrame).toBe("season");
  });
});
