import { describe, it, expect } from "vitest";
import {
  displayTeamName,
  ncaafSchool,
  nickname,
  shortTeamName,
  titleTeamName,
} from "@/lib/teamNames";
import { NCAAF_SCHOOLS } from "@/data/ncaafSchools";
import { getTeamAbbrev } from "@/utils/teamAbbreviations";

// Owner feedback (Sep 24 2026): college football showed mascots ("Aggies",
// "Tigers") where the school belongs. Labels now follow ESPN's own names.

describe("college football labels follow ESPN, never a lone mascot", () => {
  it("uses the school where the full name used to show", () => {
    expect(ncaafSchool("Texas A&M Aggies")).toBe("Texas A&M");
    expect(ncaafSchool("Miami (OH) RedHawks")).toBe("Miami (OH)");
    expect(ncaafSchool("Coastal Carolina Chanticleers")).toBe("Coastal Carolina");
    expect(displayTeamName("LSU Tigers", "NCAAF")).toBe("LSU");
    expect(titleTeamName("Notre Dame Fighting Irish", "NCAAF")).toBe("Notre Dame");
  });

  it("uses ESPN's short scoreboard name in tight spots", () => {
    expect(shortTeamName("Florida International Panthers", "NCAAF")).toBe("FIU");
    expect(shortTeamName("Pittsburgh Panthers", "NCAAF")).toBe("Pitt");
    expect(shortTeamName("Coastal Carolina Chanticleers", "NCAAF")).toBe("Coastal");
  });

  it("tells same-mascot schools apart (Boise State vs Western Michigan, both Broncos)", () => {
    const a = shortTeamName("Boise State Broncos", "NCAAF");
    const b = shortTeamName("Western Michigan Broncos", "NCAAF");
    expect(a).not.toBe(b);
    expect([a, b].some((n) => n === "Broncos")).toBe(false);
  });

  it("shows a name it has no ESPN entry for whole instead of guessing", () => {
    expect(ncaafSchool("Nowhere State Fighting Squirrels")).toBe("Nowhere State Fighting Squirrels");
    expect(shortTeamName("Nowhere State Fighting Squirrels", "NCAAF")).toBe("Nowhere State Fighting Squirrels");
  });

  it("uses ESPN's abbreviation where the UI abbreviates", () => {
    expect(getTeamAbbrev("Texas A&M Aggies", "NCAAF")).toBe("TA&M");
    expect(getTeamAbbrev("Coastal Carolina Chanticleers", "NCAAF")).toBe("CCU");
  });

  it("every entry carries a school, a short name and an abbreviation, and no school is the mascot", () => {
    const entries = Object.entries(NCAAF_SCHOOLS);
    expect(entries.length).toBeGreaterThan(200);
    for (const [full, s] of entries) {
      expect(s.school && s.short && s.abbr, full).toBeTruthy();
      // ESPN's one-word placeholder ("TBD") has no mascot to drop
      if (full.includes(" ")) expect(s.school, full).not.toBe(full.split(" ").pop());
    }
  });
});

describe("pro teams keep their nicknames", () => {
  it("reads pro teams by nickname, including two-word ones", () => {
    expect(nickname("Kansas City Chiefs")).toBe("Chiefs");
    expect(nickname("Boston Red Sox")).toBe("Red Sox");
    expect(nickname("Chicago White Sox")).toBe("White Sox");
    expect(nickname("Toronto Blue Jays")).toBe("Blue Jays");
    expect(shortTeamName("Kansas City Chiefs", "NFL")).toBe("Chiefs");
    expect(titleTeamName("Chicago White Sox", "MLB")).toBe("White Sox");
    expect(displayTeamName("Kansas City Chiefs", "NFL")).toBe("Kansas City Chiefs");
  });
});
