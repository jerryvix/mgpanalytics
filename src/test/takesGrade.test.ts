import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  creditedPerson,
  finalLabel,
  findPlayer,
  gradeTake,
  needsBox,
  parseBox,
  type GradeGame,
} from "../../supabase/functions/_shared/takes-grade";

// Real ESPN summaries, trimmed: Bengals at Commanders (MNF, Nov 23 2026, WSH 22 CIN 20)
// and Cavaliers at Bulls (Nov 23 2026, CHI 122 CLE 108).
const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, "fixtures", name), "utf8"));
const nfl = fixture("espn-summary-nfl-401873078.json");
const nba = fixture("espn-summary-nba-401910041.json");

// deno-lint-ignore no-explicit-any
function gameFrom(summary: any): GradeGame {
  // deno-lint-ignore no-explicit-any
  const side = (s: string) => summary.header.competitions[0].competitors.find((c: any) => c.homeAway === s);
  // deno-lint-ignore no-explicit-any
  const team = (c: any) => ({
    abbr: c.team.abbreviation, name: c.team.shortDisplayName, location: c.team.location,
    displayName: c.team.displayName, score: c.score,
  });
  return { away: team(side("away")), home: team(side("home")) };
}

const mnf = gameFrom(nfl);
const mnfBox = parseBox(nfl);
const cavsBulls = gameFrom(nba);
const cavsBullsBox = parseBox(nba);

const grade = (sport: string, market: string, pick: string, legs: string[] = []) =>
  sport === "NBA" ? gradeTake({ sport, market, pick, legs }, cavsBulls, cavsBullsBox)
    : gradeTake({ sport, market, pick, legs }, mnf, mnfBox);

describe("finalLabel", () => {
  it("puts the winner first", () => {
    expect(finalLabel(mnf)).toBe("WSH 22, CIN 20");
    expect(finalLabel(cavsBulls)).toBe("CHI 122, CLE 108");
  });
  it("waits for both scores", () => {
    expect(finalLabel({ away: { abbr: "A", score: null }, home: { abbr: "B", score: "3" } })).toBeNull();
  });
});

describe("spread, total and moneyline from the final score", () => {
  it("grades the Monday night sides", () => {
    expect(grade("NFL", "spread", "Commanders +5.5")).toBe("hit"); // Bear Bets
    expect(grade("NFL", "spread", "Commanders +6")).toBe("hit"); // Hold The Phone
    expect(grade("NFL", "spread", "Bengals -5.5")).toBe("miss"); // SportsLine
    expect(grade("NFL", "spread", "Bengals +2")).toBe("push");
    expect(grade("NFL", "spread", "WSH PK")).toBe("hit");
    expect(grade("NFL", "spread", "Washington Commanders -1.5")).toBe("hit");
  });
  it("grades game and team totals", () => {
    expect(grade("NFL", "total", "Over 53.5")).toBe("miss"); // 42 points
    expect(grade("NFL", "total", "U 42")).toBe("push");
    expect(grade("NFL", "total", "Under 42.5")).toBe("hit");
    expect(grade("NFL", "total", "Bengals Over 19.5")).toBe("hit");
  });
  it("grades moneylines", () => {
    expect(grade("NFL", "moneyline", "Commanders ML")).toBe("hit");
    expect(grade("NFL", "moneyline", "Bengals ML")).toBe("miss");
  });
  it("leaves halves, quarters and unknown teams ungraded", () => {
    expect(grade("NFL", "spread", "Commanders 1H +3.5")).toBeNull();
    expect(grade("NFL", "total", "1H Under 27.5")).toBeNull();
    expect(grade("NFL", "moneyline", "Cowboys ML")).toBeNull();
  });
  it("matches college short names", () => {
    const g: GradeGame = {
      away: { abbr: "CSU", name: "Colorado St", location: "Colorado State", displayName: "Colorado State Rams", score: 70 },
      home: { abbr: "ARIZ", name: "Arizona", location: "Arizona", displayName: "Arizona Wildcats", score: 80 },
    };
    expect(gradeTake({ sport: "NCAAB", market: "spread", pick: "Colorado State +9.5" }, g, null)).toBe("miss");
    expect(gradeTake({ sport: "NCAAB", market: "spread", pick: "Colorado St. +10.5" }, g, null)).toBe("hit");
    expect(gradeTake({ sport: "NCAAB", market: "spread", pick: "Arizona -10" }, g, null)).toBe("push");
    expect(gradeTake({ sport: "NCAAB", market: "total", pick: "Under 159.5" }, g, null)).toBe("hit");
  });
});

describe("player props from the box score", () => {
  it("reads the box score", () => {
    const chase = mnfBox?.players.find((p) => p.name === "Ja'Marr Chase");
    expect(chase?.stats["receiving.receivingYards"]).toBe(31);
    const burrow = mnfBox?.players.find((p) => p.name === "Joe Burrow");
    expect(burrow?.stats["passing.completions"]).toBe(28);
    expect(burrow?.stats["passing.passingAttempts"]).toBe(40);
    expect(mnfBox?.tdScorers).toEqual(["Tee Higgins", "Jacory Croskey-Merritt", "Colbie Young"]);
    expect(cavsBullsBox?.players.some((p) => p.name === "Craig Porter Jr.")).toBe(false); // did not play
    expect(cavsBullsBox?.players.find((p) => p.name === "James Harden")?.stats.threePointFieldGoalsMade).toBe(3);
  });
  it("grades the Monday night football props", () => {
    expect(grade("NFL", "prop", "Joe Burrow O 2.5 Passing Touchdowns")).toBe("miss"); // 2
    expect(grade("NFL", "prop", "Jamar Chase O 92.5 Receiving Yards")).toBe("miss"); // misspelled, 31
    expect(grade("NFL", "prop", "Jayden Daniels O 223.5 Passing Yards")).toBe("hit"); // 289
    expect(grade("NFL", "prop", "Nick Cross O 5.5 Tackles and Assists")).toBe("miss"); // 4
    expect(grade("NFL", "prop", "Ja'Marr Chase 100+ Receiving Yards")).toBe("miss");
    expect(grade("NFL", "prop", "Joe Burrow O 7.5 Rushing Yards")).toBe("miss"); // -1
    expect(grade("NFL", "prop", "Jayden Daniels O 49.5 Rush + Rec Yards")).toBe("hit"); // 55 + 0
  });
  it("grades touchdown scorers from the scoring plays", () => {
    expect(grade("NFL", "prop", "Chigozie Okonkwo Anytime TD")).toBe("miss"); // ESPN: Chig Okonkwo
    expect(grade("NFL", "prop", "Jaden Daniels Anytime TD")).toBe("miss"); // passing TDs don't count
    expect(grade("NFL", "prop", "Jacory Croskey-Merritt Anytime TD")).toBe("hit");
    expect(grade("NFL", "prop", "Mike Gesicki First TD")).toBe("miss");
    expect(grade("NFL", "prop", "Tee Higgins First TD")).toBe("hit");
  });
  it("leaves a player who isn't in the box score ungraded", () => {
    expect(grade("NFL", "prop", "Josh Downs O 36.5 Receiving Yards")).toBeNull();
    expect(grade("NBA", "prop", "Craig Porter Jr. O 5.5 Points")).toBeNull(); // DNP
    expect(grade("NFL", "prop", "Parker Washington O 33.5 First-Half Receiving Yards")).toBeNull();
    expect(grade("NFL", "prop", "Joe Burrow O 1.5 Longest Completion")).toBeNull();
  });
  it("grades basketball props", () => {
    expect(grade("NBA", "prop", "Jarrett Allen U 15.5 Points")).toBe("miss"); // 16
    expect(grade("NBA", "prop", "James Harden O 2.5 Threes")).toBe("hit"); // 3
    expect(grade("NBA", "prop", "James Harden O 21 Points")).toBe("push");
    expect(grade("NBA", "prop", "Harden Over 30.5 Pts + Reb + Ast")).toBe("hit"); // 21 + 6 + 5
    expect(grade("NBA", "prop", "Donovan Mitchell Over 25.5 Points")).toBe("hit"); // 28
    expect(grade("NBA", "prop", "Josh Giddey O 9.5 Assists")).toBe("hit"); // 11
    expect(grade("NBA", "prop", "Josh Giddey Double Double")).toBe("miss"); // 4 pts, 2 reb, 11 ast
    expect(grade("NBA", "prop", "Matas Buzelis U 14.5 Points")).toBe("miss"); // 15
  });
});

describe("parlays", () => {
  const legs = ["Ja'Marr Chase 75+ Receiving Yards", "Jaden Daniels 25+ Rushing Yards", "Stefon Diggs 50+ Receiving Yards", "Chase Brown Anytime TD"];
  it("misses when any leg misses", () => {
    expect(grade("NFL", "parlay", "Same Game Parlay", legs)).toBe("miss"); // Hold The Phone +400
  });
  it("hits only when every leg hits", () => {
    expect(grade("NFL", "parlay", "Same Game Parlay", ["Jayden Daniels 25+ Rushing Yards", "Commanders ML", "Under 53.5"])).toBe("hit");
  });
  it("stays ungraded when a leg can't be read and none missed", () => {
    expect(grade("NFL", "parlay", "Same Game Parlay", ["Commanders ML", "Commanders 1H ML"])).toBeNull();
  });
});

describe("findPlayer", () => {
  const players = [{ name: "Jayden Daniels" }, { name: "Ja'Marr Chase" }, { name: "Chase Brown" }, { name: "Chig Okonkwo" }];
  it("matches spelling slips and short first names", () => {
    expect(findPlayer("Jaden Daniels", players)?.name).toBe("Jayden Daniels");
    expect(findPlayer("Jamar Chase", players)?.name).toBe("Ja'Marr Chase");
    expect(findPlayer("Chigozie Okonkwo", players)?.name).toBe("Chig Okonkwo");
  });
  it("does not guess between players", () => {
    expect(findPlayer("Chase", players)).toBeNull(); // first name of one, last name of another
    expect(findPlayer("Stefon Diggs", players)).toBeNull();
  });
});

describe("creditedPerson", () => {
  it("credits one named person", () => {
    expect(creditedPerson("Larry Hartstein")).toBe("Larry Hartstein");
    expect(creditedPerson("  Geoff Schwartz ")).toBe("Geoff Schwartz");
  });
  it("falls back to the show for several names or none", () => {
    expect(creditedPerson("Mike McClure, Larry Hartstein")).toBeNull();
    expect(creditedPerson("McClure and Hartstein")).toBeNull();
    expect(creditedPerson("Chris Fallica & Geoff Schwartz")).toBeNull();
    expect(creditedPerson("Both")).toBeNull();
    expect(creditedPerson("")).toBeNull();
    expect(creditedPerson(null)).toBeNull();
  });
});

describe("needsBox", () => {
  it("fetches the box score only for props and parlays", () => {
    expect(needsBox({ market: "spread", pick: "Commanders +5.5" })).toBe(false);
    expect(needsBox({ market: "prop", pick: "Jarrett Allen U 15.5 Points" })).toBe(true);
    expect(needsBox({ market: "parlay", pick: "Same Game Parlay", legs: ["a", "b"] })).toBe(true);
  });
});
