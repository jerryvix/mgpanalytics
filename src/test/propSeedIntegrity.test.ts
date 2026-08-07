import { describe, it, expect } from "vitest";
import { NFL_FUTURES, NCAAF_FUTURES, FUTURES_CAPTURED_AT, FUTURES_BOOK } from "@/data/propFutures";
import {
  NFL_FUTURES as EDGE_NFL_FUTURES,
  NCAAF_FUTURES as EDGE_NCAAF_FUTURES,
  FUTURES_CAPTURED_AT as EDGE_CAPTURED_AT,
  FUTURES_BOOK as EDGE_BOOK,
} from "../../supabase/functions/sync-preseason-props/data/futures-2026";
import { SEED_PROPS_2025, SEED_SEASON } from "../../supabase/functions/sync-preseason-props/data/seed-2025";

// The edge function cannot import src/data/propFutures.ts (Deno functions
// bundle per-directory), so it carries a verbatim copy. This suite is the
// guard that the two never drift.
describe("futures capture parity (src/data/propFutures.ts vs edge copy)", () => {
  it("captures metadata match", () => {
    expect(EDGE_CAPTURED_AT).toBe(FUTURES_CAPTURED_AT);
    expect(EDGE_BOOK).toBe(FUTURES_BOOK);
  });

  it("NFL futures are identical", () => {
    expect(EDGE_NFL_FUTURES).toEqual(NFL_FUTURES);
  });

  it("NCAAF futures are identical", () => {
    expect(EDGE_NCAAF_FUTURES).toEqual(NCAAF_FUTURES);
  });
});

describe("2025 hand-curated seed integrity", () => {
  const VALID_MARKETS = new Set([
    "pass_yards", "pass_td", "rush_yards", "rush_td",
    "rec_yards", "rec_td", "receptions", "sacks",
  ]);

  it("is the 2025 vintage and non-empty", () => {
    expect(SEED_SEASON).toBe(2025);
    expect(SEED_PROPS_2025.length).toBeGreaterThanOrEqual(40);
  });

  it("every line has a valid market, positive line, and a source URL", () => {
    for (const p of SEED_PROPS_2025) {
      expect(VALID_MARKETS.has(p.market), p.player).toBe(true);
      expect(p.line, `${p.player} ${p.market}`).toBeGreaterThan(0);
      expect(p.player.trim().length).toBeGreaterThan(0);
      expect(p.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("has no duplicate player+market rows (the upsert natural key)", () => {
    const seen = new Set<string>();
    for (const p of SEED_PROPS_2025) {
      const key = `${p.market}:${p.player}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("odds, when present, are legal American prices", () => {
    for (const p of SEED_PROPS_2025) {
      for (const odds of [p.overOdds, p.underOdds]) {
        if (odds !== null) {
          expect(Math.abs(odds), `${p.player} ${p.market}`).toBeGreaterThanOrEqual(100);
        }
      }
    }
  });
});
