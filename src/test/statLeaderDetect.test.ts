import { describe, it, expect } from "vitest";
import { detectStatLeader, isHitStreakQuestion } from "@/lib/statLeaderDetect";

// These lock which questions get grounded in our own leaderboards vs. left to
// the model. A regression here = chat silently drifting back to web numbers
// that contradict the dashboard.

describe("detectStatLeader — grounded leaderboard questions", () => {
  const grounded: Array<[q: string, sport: string, column: string]> = [
    ["Who leads MLB in OPS this season?", "MLB", "ops"],
    ["Who has the most home runs in MLB?", "MLB", "home_runs"],
    ["who has the most homers right now", "MLB", "home_runs"],
    ["MLB RBI leader", "MLB", "rbi"],
    ["Who has the best batting average this year?", "MLB", "batting_avg"],
    ["most stolen bases in baseball", "MLB", "stolen_bases"],
    ["who leads the league in hits", "MLB", "hits"],
    ["Who leads the NBA in scoring?", "NBA", "points_per_game"],
    ["most rebounds per game in the NBA", "NBA", "rebounds_per_game"],
    ["NBA assists leader", "NBA", "assists_per_game"],
    ["who has the most passing yards in the NFL", "NFL", "pass_yards"],
    ["NFL rushing yards leader", "NFL", "rush_yards"],
    ["most receiving touchdowns", "NFL", "rec_td"],
    ["who leads the league in sacks", "NFL", "sacks"],
  ];

  it.each(grounded)("%s → %s/%s", (q, sport, column) => {
    const r = detectStatLeader(q, "");
    expect(r).not.toBeNull();
    expect(r!.sport).toBe(sport);
    expect(r!.column).toBe(column);
  });

  it("flags rate stats for a minimum-sample filter", () => {
    expect(detectStatLeader("who leads MLB in OPS", "")!.isRate).toBe(true);
    expect(detectStatLeader("batting average leader", "")!.isRate).toBe(true);
    expect(detectStatLeader("most home runs", "")!.isRate).toBe(false);
  });

  it("respects an explicit league even when the stat is ambiguous", () => {
    // "points" could be many sports; explicit NBA wins
    expect(detectStatLeader("who leads the NBA in points", "NBA")!.sport).toBe("NBA");
  });

  it("does NOT ground non-leaderboard questions", () => {
    expect(detectStatLeader("How many home runs does Aaron Judge have?", "")).toBeNull();
    expect(detectStatLeader("Is Yordan Alvarez good at hitting?", "")).toBeNull();
    expect(detectStatLeader("Tell me about the Dodgers season", "")).toBeNull();
    expect(detectStatLeader("What are the odds tonight?", "")).toBeNull();
  });

  it("does NOT ground when no known stat is present", () => {
    expect(detectStatLeader("who is the best team in baseball", "")).toBeNull();
    expect(detectStatLeader("most clutch player", "")).toBeNull();
  });
});

describe("isHitStreakQuestion", () => {
  it("detects streak phrasings", () => {
    expect(isHitStreakQuestion("Who has the longest active MLB hit streak?")).toBe(true);
    expect(isHitStreakQuestion("longest hitting streak right now")).toBe(true);
    expect(isHitStreakQuestion("who's the hottest bat")).toBe(true);
    expect(isHitStreakQuestion("hottest hitter in baseball")).toBe(true);
  });
  it("ignores unrelated questions", () => {
    expect(isHitStreakQuestion("who leads MLB in OPS")).toBe(false);
    expect(isHitStreakQuestion("what games are on tonight")).toBe(false);
  });
});
