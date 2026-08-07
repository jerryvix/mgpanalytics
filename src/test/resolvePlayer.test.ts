import { describe, it, expect } from "vitest";
import {
  buildPlayerResolver,
  normalizePlayerName as sharedNormalize,
  type CrosswalkRow,
} from "../../supabase/functions/_shared/resolve-player";
import { normalizePlayerName as frontendNormalize } from "@/utils/fantasyTrends";

const crosswalk: CrosswalkRow[] = [
  { gsis_id: "00-0033873", name_normalized: "patrick mahomes", position: "QB", latest_team: "KC" },
  { gsis_id: "00-0036389", name_normalized: "jamarr chase", position: "WR", latest_team: "CIN" },
  { gsis_id: "00-0036963", name_normalized: "amonra st brown", position: "WR", latest_team: "DET" },
  // Two Josh Allens - the Bills QB and the former Jaguars edge rusher
  { gsis_id: "00-0034857", name_normalized: "josh allen", position: "QB", latest_team: "BUF" },
  { gsis_id: "00-0035577", name_normalized: "josh allen", position: "OLB", latest_team: "JAX" },
  // Two RB Michael Carters (Jets 2021 draft class collision)
  { gsis_id: "00-0036924", name_normalized: "michael carter", position: "RB", latest_team: "ARI" },
  { gsis_id: "00-0036925", name_normalized: "michael carter", position: "RB", latest_team: "NYJ" },
];

describe("normalizePlayerName (shared twin)", () => {
  it("matches the frontend implementation on the canonical hard cases", () => {
    for (const name of [
      "A.J. Brown",
      "AJ Brown",
      "Ja'Marr Chase",
      "Amon-Ra St. Brown",
      "Marvin Harrison Jr.",
      "Kenneth Walker III",
      "Anthony Richardson Sr.",
      "  Patrick   Mahomes ",
    ]) {
      expect(sharedNormalize(name)).toBe(frontendNormalize(name));
    }
  });
});

describe("buildPlayerResolver", () => {
  const resolver = buildPlayerResolver(crosswalk);

  it("resolves a unique normalized-name match regardless of source spelling", () => {
    expect(resolver.resolve("Ja'Marr Chase", "WR")).toBe("00-0036389");
    expect(resolver.resolve("JaMarr Chase")).toBe("00-0036389");
    expect(resolver.resolve("Amon-Ra St. Brown", "WR")).toBe("00-0036963");
  });

  it("uses the position hint to split duplicate names", () => {
    expect(resolver.resolve("Josh Allen", "QB")).toBe("00-0034857");
    expect(resolver.resolve("Josh Allen", "OLB")).toBe("00-0035577");
  });

  it("accepts a position SET (market-implied pools split duplicates too)", () => {
    // A rushing prop can belong to any offensive skill position - still
    // enough to split the QB from the edge rusher.
    expect(resolver.resolve("Josh Allen", ["QB", "RB", "FB", "WR", "TE"])).toBe("00-0034857");
    expect(resolver.resolve("Michael Carter", ["QB", "RB", "FB", "WR", "TE"])).toBeNull(); // both RBs remain
  });

  it("falls back to team when position cannot split the pool", () => {
    expect(resolver.resolve("Michael Carter", "RB", "NYJ")).toBe("00-0036925");
  });

  it("returns null instead of guessing when still ambiguous", () => {
    expect(resolver.resolve("Josh Allen")).toBeNull();
    expect(resolver.resolve("Michael Carter", "RB")).toBeNull();
  });

  it("returns null for unknown names", () => {
    expect(resolver.resolve("Not A Player")).toBeNull();
  });

  it("ignores a bad position hint rather than dropping a unique match", () => {
    // Source lists Mahomes as "P" by mistake - unique name still resolves
    expect(resolver.resolve("Patrick Mahomes", "P")).toBe("00-0033873");
  });

  it("prefers a manual override for the source spelling", () => {
    const withOverride = buildPlayerResolver(crosswalk, { "Josh Allen (Bills)": "00-0034857" });
    expect(withOverride.resolve("Josh Allen (Bills)")).toBe("00-0034857");
  });
});
