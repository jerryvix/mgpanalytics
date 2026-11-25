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

  it("keeps the owner's sentence shape (D-117)", () => {
    expect(checkSentence(dak, "In 5 of his last 6 Thanksgiving games, Dak Prescott has cleared 263.5 Pass Yds")).toBe("player name not first");
    expect(checkSentence(dak, "Dak Prescott has cleared 263.5 Pass Yds in 83% of his Thanksgiving games, 5 of his last 6")).toBe("percentage");
    expect(checkSentence(dak, "Dak Prescott has cleared 263.5 Pass Yds at home and on the road in 5 of his last 6 Thanksgiving games")).toBe("two splits");
  });

  it("keeps the words that say which games the record covers (D-119)", () => {
    const amen = { ...dak, player_name: "Amen Thompson", stat: "Pts", stat_terms: ["Pts"], line: 14.5, hits: 11, games: 14, record: "11 of his 14",
      window: "starter", conditions: [], family: "form", angle_type: "form:starter",
      sentence: "Amen Thompson has cleared 14.5 Pts in 11 of his 14 games since moving into the starting lineup" };
    expect(checkSentence(amen, "Amen Thompson has topped 14.5 Pts in 11 of his 14 games since moving into the starting lineup")).toBeNull();
    expect(checkSentence(amen, "Amen Thompson has topped 14.5 Pts in 11 of his 14 games")).toMatch(/dropped "since"/);
    const stafford = { ...dak, player_name: "Matthew Stafford", line: 231.5, hits: 25, games: 30, record: "25 of his last 30",
      sentence: "Matthew Stafford has gone over 231.5 Pass Yds in 25 of his last 30 prime-time games" };
    expect(checkSentence(stafford, "Matthew Stafford has cleared 231.5 Pass Yds in 25 of his last 30 prime-time games")).toBeNull();
    expect(checkSentence(stafford, "Matthew Stafford has cleared 231.5 Pass Yds in 25 of his last 30 games")).toMatch(/prime-time/);
    expect(checkSentence(gibbs, "Jahmyr Gibbs has scored in 10 of his last 11 games against Top-10 run defenses")).toBeNull();
  });

  it("checks milestones and streaks (D-119)", () => {
    const giannis = { ...dak, player_name: "Giannis Antetokounmpo", stat: "Pts", stat_terms: ["Pts"], line: 28.5, hits: 8, games: 10,
      record: "8 of his last 10", window: "last10", conditions: [], family: "form", angle_type: "form:milestone", milestone: 30,
      sentence: "Giannis Antetokounmpo has scored 30 or more Pts in 8 of his last 10 games" };
    expect(checkSentence(giannis, "Giannis Antetokounmpo has put up 30 or more Pts in 8 of his last 10 games")).toBeNull();
    expect(checkSentence(giannis, "Giannis Antetokounmpo has scored at least 30 Pts in 8 of his last 10 games")).toBeNull();
    expect(checkSentence(giannis, "Giannis Antetokounmpo has scored 30 Pts in 8 of his last 10 games")).toBe('dropped "or more"');
    expect(checkSentence(giannis, "Giannis Antetokounmpo has cleared 28.5 Pts in 8 of his last 10 games")).toMatch(/number 28.5/);
    const jokic = { ...dak, player_name: "Nikola Jokic", stat: "Reb", stat_terms: ["Reb"], line: 11.5, hits: 9, games: 9, record: "9 straight",
      window: "streak", conditions: [], family: "form", angle_type: "form:streak", sentence: "Nikola Jokic has gone over 11.5 Reb in 9 straight games" };
    expect(checkSentence(jokic, "Nikola Jokic has topped 11.5 Reb in 9 straight games")).toBeNull();
    expect(checkSentence(jokic, "Nikola Jokic has topped 11.5 Reb in all 9 of his games")).toBe("record changed");
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
