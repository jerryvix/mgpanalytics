import { describe, it, expect } from "vitest";
import { pickPerson, parseVsPlayerTotal } from "@/services/mlb/batterVsPitcher";

const person = (id: number, fullName: string, pos: string, active = true) => ({
  id,
  fullName,
  active,
  primaryPosition: { abbreviation: pos },
});

describe("pickPerson", () => {
  it("prefers the exact name match", () => {
    const people = [person(1, "Luis Garcia", "2B"), person(2, "Luis Garcia Jr.", "SS")];
    expect(pickPerson(people, "Luis Garcia", false)?.id).toBe(1);
  });

  it("matches accent- and period-insensitively", () => {
    const people = [person(9, "José Ramírez", "3B")];
    expect(pickPerson(people, "Jose Ramirez", false)?.id).toBe(9);
    expect(pickPerson([person(3, "J.T. Realmuto", "C")], "JT Realmuto", false)?.id).toBe(3);
  });

  it("filters by role — pitchers for pitcher lookups, hitters otherwise", () => {
    const people = [person(1, "Will Smith", "P"), person(2, "Will Smith", "C")];
    expect(pickPerson(people, "Will Smith", true)?.id).toBe(1);
    expect(pickPerson(people, "Will Smith", false)?.id).toBe(2);
  });

  it("prefers active players, but falls back to inactive", () => {
    const people = [person(1, "Chris Young", "P", false), person(2, "Chris Young", "P", true)];
    expect(pickPerson(people, "Chris Young", true)?.id).toBe(2);
    expect(pickPerson([person(1, "Chris Young", "P", false)], "Chris Young", true)?.id).toBe(1);
  });

  it("returns null for empty input", () => {
    expect(pickPerson([], "Anyone", false)).toBeNull();
  });
});

describe("parseVsPlayerTotal", () => {
  it("parses a normal career line", () => {
    const json = {
      stats: [
        {
          splits: [{ stat: { avg: ".350", ops: "1.410", atBats: 40, hits: 14, homeRuns: 8 } }],
        },
      ],
    };
    expect(parseVsPlayerTotal(json)).toEqual({ avg: 0.35, ops: 1.41, atBats: 40, hits: 14, homeRuns: 8 });
  });

  it("treats the API's '.---' empty average as null", () => {
    const json = { stats: [{ splits: [{ stat: { avg: ".---", ops: ".---", atBats: 0, hits: 0, homeRuns: 0 } }] }] };
    const line = parseVsPlayerTotal(json)!;
    expect(line.avg).toBeNull();
    expect(line.ops).toBeNull();
    expect(line.atBats).toBe(0);
  });

  it("returns null when there are no splits (never faced)", () => {
    expect(parseVsPlayerTotal({ stats: [{ splits: [] }] })).toBeNull();
    expect(parseVsPlayerTotal({ stats: [] })).toBeNull();
    expect(parseVsPlayerTotal({})).toBeNull();
    expect(parseVsPlayerTotal(null)).toBeNull();
  });
});
