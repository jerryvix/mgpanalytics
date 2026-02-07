import { describe, it, expect } from "vitest";

/**
 * Contract tests for the classifyQuestionType() function in
 * supabase/functions/gemini-chat/index.ts (lines 170-185).
 *
 * The function runs in the Deno edge function and can't be imported
 * directly into Vitest. We replicate the exact regex logic here so
 * these tests act as a living spec — if someone changes the regexes
 * in the edge function, these tests document the expected behavior.
 */

type QuestionType = "MARKET_SPECIFIC" | "CONTEXTUAL" | "FACTUAL";

function classifyQuestionType(message: string): QuestionType {
  const m = message.toLowerCase();

  if (
    /\b(odds|line|spread|total|moneyline|ml|ats|point spread|prop|over\s*\/?\s*under|o\/u|book|sportsbook|draftkings|fanduel|betmgm|caesars|movement|moved|value|edge|mispricing|sharp|steam|juice|vig|handle)\b/.test(
      m
    )
  ) {
    return "MARKET_SPECIFIC";
  }

  if (
    /\b(trend|matchup|factor|situational|home.*(road|away)|road.*(home|away)|streak|split|against.*(spread|the)|ats|when|how.*(do|does|perform)|last\s+\d+\s+games|pace|rating|efficiency|advantage|comparison|compare)\b/.test(
      m
    )
  ) {
    return "CONTEXTUAL";
  }

  return "FACTUAL";
}

// ── MARKET_SPECIFIC ──────────────────────────────────────────────────

describe("Question type: MARKET_SPECIFIC", () => {
  const cases = [
    "What are the odds for tonight's game",
    "Spread on Bills vs Chiefs",
    "Has the line moved on the Lakers game",
    "DraftKings props for Mahomes",
    "Sharp money on the over",
    "What's the moneyline for Eagles",
    "FanDuel totals for tonight",
    "Is there any edge on the under",
    "Over/under for the Chiefs game",
    "Any steam moves today",
    "What's the juice on the Bills",
    "BetMGM point spread",
    "Caesars sportsbook lines",
  ];

  cases.forEach((query) => {
    it(`classifies "${query}" as MARKET_SPECIFIC`, () => {
      expect(classifyQuestionType(query)).toBe("MARKET_SPECIFIC");
    });
  });
});

// ── CONTEXTUAL ───────────────────────────────────────────────────────

describe("Question type: CONTEXTUAL", () => {
  const cases = [
    "How does Mahomes perform on the road",
    "Bills trend this season on the road",
    "Last 5 games matchup comparison",
    "Home vs away splits for the Eagles",
    "What's the pace rating for the Celtics",
    "How do the Chiefs compare to the Bills",
    "Winning streak for the Lions",
    "Situational factors for the Ravens game",
    "What advantage do home teams have",
  ];

  cases.forEach((query) => {
    it(`classifies "${query}" as CONTEXTUAL`, () => {
      expect(classifyQuestionType(query)).toBe("CONTEXTUAL");
    });
  });
});

// ── FACTUAL ──────────────────────────────────────────────────────────

describe("Question type: FACTUAL", () => {
  const cases = [
    "Who is Patrick Mahomes",
    "How many Super Bowls have the Chiefs won",
    "Tell me about Drake Maye",
    "What team does Josh Allen play for",
    "Who won the 2024 Super Bowl",
    "How old is Tom Brady",
  ];

  cases.forEach((query) => {
    it(`classifies "${query}" as FACTUAL`, () => {
      expect(classifyQuestionType(query)).toBe("FACTUAL");
    });
  });
});

// ── Edge cases and priority ──────────────────────────────────────────

describe("Question type: priority resolution", () => {
  it("MARKET_SPECIFIC takes priority over CONTEXTUAL", () => {
    // "spread" matches MARKET_SPECIFIC, "trend" matches CONTEXTUAL
    // MARKET_SPECIFIC check comes first, so it wins
    expect(classifyQuestionType("trend in the spread movement")).toBe("MARKET_SPECIFIC");
  });

  it("defaults to FACTUAL for generic questions", () => {
    expect(classifyQuestionType("hello")).toBe("FACTUAL");
    expect(classifyQuestionType("what is football")).toBe("FACTUAL");
  });
});
