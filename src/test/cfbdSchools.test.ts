import { describe, it, expect } from "vitest";
import { cfbdSchoolCandidates, pickCfbdSchool } from "@/utils/cfbdSchools";

// Schools that actually exist in CFBD data - the resolver matches candidates
// against a set like this built from real rows at query time.
const CFBD_SCHOOLS = new Set([
  "Alabama",
  "Georgia",
  "Georgia State",
  "Georgia Southern",
  "Georgia Tech",
  "Miami",
  "Miami (OH)",
  "Ohio State",
  "Ohio",
  "App State", // CFBD's own spelling (all seasons), not "Appalachian State"
  "UL Monroe", // likewise, not "Louisiana Monroe"
  "Texas",
  "Florida",
  "Indiana",
  "Houston",
  "North Carolina",
  "Utah",
  "Penn State",
  "Arizona State",
  "Delaware",
  "South Florida",
  "Pittsburgh",
  "San José State",
  "Hawai'i",
  "Texas A&M",
  "NC State",
  "USC",
  "Ole Miss",
]);

const resolve = (espnName: string) =>
  pickCfbdSchool(cfbdSchoolCandidates(espnName), CFBD_SCHOOLS);

describe("cfbdSchoolCandidates", () => {
  it("strips one- and two-word mascots, best-first", () => {
    expect(cfbdSchoolCandidates("Alabama Crimson Tide")).toEqual(["Alabama Crimson", "Alabama"]);
    expect(cfbdSchoolCandidates("Georgia Bulldogs")).toEqual(["Georgia"]);
  });

  it("returns only the override when one exists", () => {
    expect(cfbdSchoolCandidates("USF Bulls")).toEqual(["South Florida"]);
    expect(cfbdSchoolCandidates("Miami (OH) RedHawks")).toEqual(["Miami (OH)"]);
  });

  it("never strips past a school qualifier - that prefix is already the full school name", () => {
    expect(cfbdSchoolCandidates("Texas Southern Tigers")).toEqual(["Texas Southern"]);
    expect(cfbdSchoolCandidates("Florida A&M Rattlers")).toEqual(["Florida A&M"]);
    expect(cfbdSchoolCandidates("Indiana State Sycamores")).toEqual(["Indiana State"]);
  });
});

describe("pickCfbdSchool", () => {
  it("resolves standard names through the mascot heuristic", () => {
    expect(resolve("Alabama Crimson Tide")).toBe("Alabama");
    expect(resolve("Texas A&M Aggies")).toBe("Texas A&M");
    expect(resolve("USC Trojans")).toBe("USC");
    expect(resolve("Ole Miss Rebels")).toBe("Ole Miss");
  });

  it("prefers the longer prefix - Georgia State never collapses to Georgia", () => {
    expect(resolve("Georgia State Panthers")).toBe("Georgia State");
    expect(resolve("Georgia Southern Eagles")).toBe("Georgia Southern");
    expect(resolve("Ohio State Buckeyes")).toBe("Ohio State");
    expect(resolve("Ohio Bobcats")).toBe("Ohio");
  });

  it("keeps the two Miamis apart", () => {
    expect(resolve("Miami Hurricanes")).toBe("Miami");
    expect(resolve("Miami (OH) RedHawks")).toBe("Miami (OH)");
    expect(resolve("Miami RedHawks")).toBe("Miami (OH)");
  });

  it("resolves CFBD's short spellings without overrides", () => {
    expect(resolve("App State Mountaineers")).toBe("App State");
    expect(resolve("UL Monroe Warhawks")).toBe("UL Monroe");
  });

  it("still strips two-word mascots on FBS schools whose names carry a qualifier", () => {
    expect(resolve("Penn State Nittany Lions")).toBe("Penn State");
    expect(resolve("Arizona State Sun Devils")).toBe("Arizona State");
    expect(resolve("Georgia Tech Yellow Jackets")).toBe("Georgia Tech");
    expect(resolve("Delaware Blue Hens")).toBe("Delaware");
  });

  it("does not hand an FCS opponent an FBS school's identity", () => {
    // Each of these once resolved to the FBS school in parentheses and
    // showed that school's draft prospects and roster data
    expect(resolve("Texas Southern Tigers")).toBeNull(); // Texas
    expect(resolve("Florida A&M Rattlers")).toBeNull(); // Florida
    expect(resolve("Indiana State Sycamores")).toBeNull(); // Indiana
    expect(resolve("Houston Christian Huskies")).toBeNull(); // Houston
    expect(resolve("North Carolina Central Eagles")).toBeNull(); // North Carolina
    expect(resolve("North Carolina A&T Aggies")).toBeNull(); // North Carolina
    expect(resolve("Utah Tech Trailblazers")).toBeNull(); // Utah
    expect(resolve("Alabama State Hornets")).toBeNull(); // Alabama
    expect(resolve("Delaware State Hornets")).toBeNull(); // Delaware
  });

  it("routes non-prefix names through overrides", () => {
    expect(resolve("USF Bulls")).toBe("South Florida");
    expect(resolve("Pitt Panthers")).toBe("Pittsburgh");
    expect(resolve("San Jose State Spartans")).toBe("San José State");
    expect(resolve("Hawai'i Rainbow Warriors")).toBe("Hawai'i");
  });

  it("returns null (→ insufficient arm) for unknown teams instead of guessing", () => {
    expect(resolve("Fighting Nonexistents FC")).toBeNull();
  });
});
