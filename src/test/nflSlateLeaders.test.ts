import { describe, it, expect } from "vitest";
import { pairByValue, teamLeaders, type SeasonLine } from "../../supabase/functions/nfl-slate-leaders/leaders";

const ATL = { id: 27, abbreviation: "ATL", full_name: "Atlanta Falcons", name: "Falcons" };
const GB = { id: 12, abbreviation: "GB", full_name: "Green Bay Packers", name: "Packers" };

const line = (id: number, first: string, last: string, pos: string, s: Partial<SeasonLine>): SeasonLine => ({
  player: { id, first_name: first, last_name: last, position_abbreviation: pos },
  games_played: 2,
  ...s,
});

// 2026 through Week 2 (BDL season stats, matching ESPN's team leaders)
const atl = [
  line(20, "Cooper", "Rush", "QB", { passing_yards: 229, rushing_yards: 20, qbr: 5.2 }),
  line(1, "Bijan", "Robinson", "RB", { rushing_yards: 155, receiving_yards: 99, receptions: 8 }),
  line(2, "Brian", "Robinson Jr.", "RB", { rushing_yards: 82 }),
  line(3, "Drake", "London", "WR", { receiving_yards: 80, receptions: 6 }),
];
const gb = [
  line(10, "Jordan", "Love", "QB", { passing_yards: 532, passing_touchdowns: 4, passing_interceptions: 1 }),
  line(11, "MarShawn", "Lloyd", "RB", { rushing_yards: 57 }),
  line(12, "Christian", "Watson", "WR", { receiving_yards: 188, receptions: 10 }),
];

describe("teamLeaders", () => {
  it("counts every position for receiving: Bijan Robinson's 99 beats Drake London's 80", () => {
    expect(teamLeaders(atl, ATL).receiving?.last_name).toBe("Robinson");
    expect(teamLeaders(atl, ATL).receiving?.stat_value).toBe(99);
  });

  it("counts every position for rushing too (a running QB can lead)", () => {
    const qbLeads = [line(5, "Lamar", "Jackson", "QB", { passing_yards: 400, rushing_yards: 180 }), line(6, "Derrick", "Henry", "RB", { rushing_yards: 150 })];
    expect(teamLeaders(qbLeads, ATL).rushing?.last_name).toBe("Jackson");
  });
});

describe("pairByValue", () => {
  it("keeps away-first order but ranks by the stat (Love's 532 is #1 over Rush's 229)", () => {
    const pair = pairByValue(teamLeaders(atl, ATL).passing, teamLeaders(gb, GB).passing);
    expect(pair.map((p) => `${p.last_name}#${p.rank}`)).toEqual(["Rush#2", "Love#1"]);
  });

  it("gives ties the same rank and drops a missing side", () => {
    const a = teamLeaders([line(1, "A", "One", "WR", { receiving_yards: 50 })], ATL).receiving;
    const b = teamLeaders([line(2, "B", "Two", "WR", { receiving_yards: 50 })], GB).receiving;
    expect(pairByValue(a, b).map((p) => p.rank)).toEqual([1, 1]);
    expect(pairByValue(a, null)).toHaveLength(1);
  });
});
