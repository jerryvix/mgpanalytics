import { describe, expect, it } from "vitest";

import { buildRows, type Candidate, checkSentence, finalLine, forJudge, recordRun } from "../../supabase/functions/_shared/player-lines";

// D-106: the judge may reword a player line, never change what it says. Every number, the player,
// the stat, the side and every proper noun have to survive, or the engine's draft is stored.
const dak: Candidate = {
  id: "c0", player_name: "Dak Prescott", short_name: "D. Prescott", espn_athlete_id: "2577417", team: "DAL", market: "pass_yds",
  market_short: "Pass Yds", stat: "Pass Yds", stat_terms: ["Pass Yds"], line: 263.5, side: "over", price: null, hits: 5, games: 6,
  record: "5 of his last 6", sentence: "Dak Prescott has cleared 263.5 Pass Yds in 5 of his last 6 Thanksgiving games",
  window: "career", conditions: ["special"], family: "special", angle_type: "special:thanksgiving", ticker: null, tier: "strong",
};
const gibbs: Candidate = {
  ...dak, id: "c1", player_name: "Jahmyr Gibbs", short_name: "J. Gibbs", team: "DET", market: "anytime_td", market_short: "Anytime TD",
  stat: "touchdowns", stat_terms: ["scored", "touchdown", "TD"], line: 0.5, hits: 10, games: 11, record: "10 of his last 11",
  sentence: "Jahmyr Gibbs has scored in 10 of his last 11 games vs Top-10 run defenses", conditions: ["defense"], family: "defense",
  angle_type: "defense:rush", ticker: "CHI DEF 7th in Rush YPG Allowed",
};

describe("player line judge checks (D-106)", () => {
  it("accepts a reworded sentence that keeps every fact", () => {
    expect(checkSentence(dak, "Dak Prescott has gone over 263.5 Pass Yds in 5 of his last 6 Thanksgiving games")).toBeNull();
    expect(checkSentence(gibbs, "Jahmyr Gibbs has scored in 10 of his last 11 games against Top-10 run defenses")).toBeNull();
  });

  it("rejects changed numbers, rounded lines, flipped sides and dropped conditions", () => {
    expect(checkSentence(dak, "Dak Prescott has gone over 264 Pass Yds in 5 of his last 6 Thanksgiving games")).toMatch(/number/);
    expect(checkSentence(dak, "Dak Prescott has gone over 263.5 Pass Yds in 5 of his last 7 Thanksgiving games")).toMatch(/number/);
    expect(checkSentence(dak, "Dak Prescott has stayed under 263.5 Pass Yds in 5 of his last 6 Thanksgiving games")).toMatch(/side/);
    expect(checkSentence(dak, "Dak Prescott has gone over 263.5 Pass Yds in 5 of his last 6 games")).toMatch(/Thanksgiving/);
    expect(checkSentence(dak, "Prescott has gone over 263.5 Pass Yds in 5 of his last 6 Thanksgiving games")).toMatch(/player/);
    expect(checkSentence(dak, "Dak Prescott has gone over 263.5 passing yards in 5 of his last 6 Thanksgiving games")).toMatch(/stat|Pass/);
  });

  it("keeps the record's exact form", () => {
    const lamb = { ...dak, player_name: "CeeDee Lamb", stat: "catches", stat_terms: ["catches"], line: 7.5, side: "under" as const, hits: 5, games: 5,
      record: "5 straight", sentence: "CeeDee Lamb has been held under 7.5 catches in 5 straight Thanksgiving games" };
    expect(checkSentence(lamb, "CeeDee Lamb has stayed under 7.5 catches in 5 straight Thanksgiving games")).toBeNull();
    expect(checkSentence(lamb, "CeeDee Lamb has been held under 7.5 catches in all 5 of his Thanksgiving games")).toBe("record changed");
  });

  it("rejects pick language and dashes", () => {
    expect(checkSentence(dak, "Dak Prescott has cleared 263.5 Pass Yds in 5 of his last 6 Thanksgiving games, a lock")).toMatch(/pick/);
    const em = String.fromCharCode(0x2014);
    expect(checkSentence(dak, `Dak Prescott ${em} 263.5 Pass Yds in 5 of his last 6 Thanksgiving games`)).toBe("dash");
  });

  it("finds the record to bold", () => {
    expect(recordRun("CeeDee Lamb has stayed under 7.5 catches in 16 straight games after a Cowboys win", 16, 16)).toBe("16 straight");
    expect(recordRun("x in all 5 of his Thanksgiving games", 5, 5)).toBe("all 5");
    expect(recordRun("x in 9 of his 11 games since joining the Heat", 9, 11)).toBe("9 of his 11");
  });

  it("falls back to the engine's draft and keeps the ticker on a class of opponents", () => {
    const bad = finalLine(gibbs, { candidate_id: "c1", sentence: "Jahmyr Gibbs scores often", show_ticker: false, reason: "" });
    expect(bad.by).toBe("engine");
    expect(bad.text).toBe(gibbs.sentence);
    expect(bad.ticker).toBe("CHI DEF 7th in Rush YPG Allowed");
    const good = finalLine(dak, { candidate_id: "c0", sentence: "Dak Prescott has gone over 263.5 Pass Yds in 5 of his last 6 Thanksgiving games", show_ticker: false, reason: "" });
    expect(good.by).toBe("judge");
    expect(good.record).toBe("5 of his last 6");
    expect(good.ticker).toBeNull();
  });

  it("keeps an angle type off a third game, and stores 3 rows for 3 different players", () => {
    const cands = [gibbs, { ...gibbs, id: "c2", player_name: "A" }, { ...dak, id: "c3", player_name: "B" }, { ...dak, id: "c4", player_name: "C" }, { ...dak, id: "c5", player_name: "D", angle_type: "setting:prime" }];
    expect(forJudge(cands, { "defense:rush": 2 }).map((c) => c.id)).toEqual(["c3", "c4", "c5"]);
    const rows = buildRows({ espn_event_id: "1", sport: "NFL", starts_at: "2026-11-26T18:00Z", candidates: [dak, gibbs, { ...gibbs, id: "c9" }] }, gibbs,
      finalLine(gibbs, null));
    expect(rows.map((r) => [r.player_name, r.rank])).toEqual([["Jahmyr Gibbs", 1], ["Dak Prescott", 2]]);
  });
});
