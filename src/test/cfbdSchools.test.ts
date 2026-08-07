import { describe, it, expect } from "vitest";
import { cfbdSchoolCandidates, pickCfbdSchool } from "@/utils/cfbdSchools";

// Schools that actually exist in CFBD data - the resolver matches candidates
// against a set like this built from real rows at query time.
const CFBD_SCHOOLS = new Set([
  "Alabama",
  "Georgia",
  "Georgia State",
  "Georgia Southern",
  "Miami",
  "Miami (OH)",
  "Ohio State",
  "Ohio",
  "Appalachian State",
  "Louisiana Monroe",
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
    expect(cfbdSchoolCandidates("App State Mountaineers")).toEqual(["Appalachian State"]);
    expect(cfbdSchoolCandidates("UL Monroe Warhawks")).toEqual(["Louisiana Monroe"]);
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
