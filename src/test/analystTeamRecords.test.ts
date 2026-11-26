import { describe, expect, it } from "vitest";

import { formatTeamRecords, matchTeams, RECORD_QUESTION, type TeamRecordRow } from "../../supabase/functions/_shared/team-records";
import fixture from "./fixtures/team-records.json";

// D-127: the Analyst reads each team's season ATS and over/under record from MGP's own games.
const rows = fixture as TeamRecordRow[];
const of = (sport: string) => rows.filter((r) => r.sport === sport);
const names = (msg: string, sport: string) => matchTeams(msg, of(sport)).map((r) => r.team_name);

describe("team records for the Analyst", () => {
  it("finds pro teams by nickname or abbreviation", () => {
    expect(names("How are the Bills ATS this season?", "NFL")).toEqual(["Buffalo Bills"]);
    expect(names("Chiefs vs Bills over/under record", "NFL")).toEqual(["Kansas City Chiefs", "Buffalo Bills"]);
    expect(names("How has OKC done against the spread?", "NBA")).toEqual(["Oklahoma City Thunder"]);
    expect(names("trail blazers ats lately", "NBA")).toEqual(["Portland Trail Blazers"]);
    expect(names("How are the Miami Dolphins covering?", "NFL")).toEqual(["Miami Dolphins"]);
  });

  it("finds colleges by school, the closer name first", () => {
    expect(names("Ohio State ATS this season", "NCAAF")).toEqual(["Ohio State Buckeyes"]);
    expect(names("How is Ohio covering?", "NCAAF")).toEqual(["Ohio Bobcats"]);
    expect(names("Miami against the spread", "NCAAF")).toEqual(["Miami Hurricanes"]);
    expect(names("Texas A&M vs Texas totals", "NCAAF")).toEqual(["Texas A&M Aggies", "Texas Longhorns"]);
    expect(names("north carolina record", "NCAAF")).toEqual(["North Carolina Tar Heels"]);
    expect(names("How is Alabama ATS?", "NCAAF")).toEqual(["Alabama Crimson Tide"]);
  });

  it("only answers questions about records", () => {
    expect(RECORD_QUESTION.test("How are the Bills ATS this season?")).toBe(true);
    expect(RECORD_QUESTION.test("Is the over hitting in Chiefs games?")).toBe(true);
    expect(RECORD_QUESTION.test("Who is the Bills' kicker?")).toBe(false);
  });

  it("writes one window whose records add up", () => {
    const bills = of("NFL").find((r) => r.team === "BUF")!;
    const block = formatTeamRecords([bills]);
    expect(block).toContain("AUTHORITATIVE");
    expect(block).toContain(`Buffalo Bills ('26 NFL, ${bills.record.games} games, this season through Nov 22nd)`);
    expect(block).toContain("(Tied 1st in NFL)");
    expect(block).toContain(`ATS ${bills.record.ats} (`);
    const sum = (rec: string) => rec.split("-").reduce((n, x) => n + Number(x), 0);
    expect(sum(bills.record.ats)).toBe(bills.record.games);
    expect(sum(bills.record.ou)).toBe(bills.record.ou_games);
    const dashes = [0x2212, 0x2013, 0x2014].map((c) => String.fromCharCode(c));
    expect(dashes.some((d) => block.includes(d))).toBe(false);
  });
});
