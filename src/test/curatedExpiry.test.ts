import { describe, it, expect } from "vitest";
import {
  NFL_TRENDING,
  NCAAF_TRENDING,
  MLB_TRENDING,
  currentTrending,
  isCurrentAngle,
  trendingFor,
} from "@/data/trendingBets";
import { EDGE_POOL, activeEdges, edgeOfTheDay } from "@/data/edges";

// Curated angles expire (QC round 3, Sep 24 2026): a Game Insights sheet was
// still saying the Dodgers "enter the All-Star break" as the World Series
// favorite ten weeks after the break.

const at = (iso: string) => new Date(iso);
const SEP_24 = at("2026-09-24T19:00:00Z");

describe("trending angles expire", () => {
  it("hides the All-Star-break Dodgers angle after the break, and showed it during", () => {
    const during = trendingFor("MLB", at("2026-07-15T18:00:00Z")).map((b) => b.id);
    expect(during).toContain("mlb-ws-dodgers");
    const after = trendingFor("MLB", at("2026-07-17T18:00:00Z")).map((b) => b.id);
    expect(after).not.toContain("mlb-ws-dodgers");
  });

  it("drops preseason NFL and NCAAF boards once games begin (Eastern calendar day)", () => {
    // NFL opener kicked off the night of Sep 9 ET (Sep 10 00:20 UTC): still Sep 9 in the East
    expect(trendingFor("NFL", at("2026-09-10T00:30:00Z")).length).toBeGreaterThan(0);
    expect(trendingFor("NFL", at("2026-09-10T16:00:00Z"))).toEqual([]);
    expect(trendingFor("NCAAF", at("2026-08-28T20:00:00Z")).length).toBeGreaterThan(0);
    expect(trendingFor("NCAAF", at("2026-08-29T16:00:00Z"))).toEqual([]);
  });

  it("shows nothing stale on Sep 24 2026 anywhere trendingFor or currentTrending feeds", () => {
    expect(trendingFor("MLB", SEP_24)).toEqual([]);
    expect(trendingFor("NFL", SEP_24)).toEqual([]);
    expect(trendingFor("NCAAF", SEP_24)).toEqual([]);
    expect(currentTrending([...NFL_TRENDING, ...NCAAF_TRENDING], SEP_24)).toEqual([]);
  });

  it("gives every priced entry an expiry (a price is always point-in-time)", () => {
    for (const b of [...NFL_TRENDING, ...NCAAF_TRENDING, ...MLB_TRENDING]) {
      expect(b.validThrough, b.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(b.validThrough! >= b.updated, b.id).toBe(true);
    }
  });

  it("treats an entry without validThrough as timeless", () => {
    expect(isCurrentAngle({}, SEP_24)).toBe(true);
  });
});

describe("edge pool expiry", () => {
  it("keeps evergreen facts but strips the July market lines", () => {
    const edges = activeEdges(EDGE_POOL, SEP_24);
    expect(edges.length).toBe(EDGE_POOL.length); // every fact still true today
    expect(edges.filter((e) => e.market)).toEqual([]); // every July price expired
  });

  it("gives every attached market an expiry", () => {
    for (const e of EDGE_POOL) if (e.market) expect(e.market.validThrough, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("drops facts a later result can falsify once that result is due", () => {
    const afterHonors = activeEdges(EDGE_POOL, at("2027-02-12T17:00:00Z")).map((e) => e.id);
    expect(afterHonors).not.toContain("edge-mvp-repeat"); // "none since Rodgers"
    expect(afterHonors).not.toContain("edge-mvp-qb"); // "the last 13 MVPs"
    expect(afterHonors).not.toContain("edge-garrett-unanimous"); // "just the second unanimous DPOY"
    expect(afterHonors).not.toContain("edge-sec-dominance"); // "the last two crowns"
    expect(afterHonors).not.toContain("edge-indiana-title"); // "just the third 16-0 champion"
    expect(afterHonors).not.toContain("edge-heisman-griffin"); // "no one has matched it"
    expect(afterHonors).toContain("edge-dimaggio");
    // Each falls away at its own result, not before
    const beforeTitle = activeEdges(EDGE_POOL, at("2027-01-17T17:00:00Z")).map((e) => e.id);
    expect(beforeTitle).toContain("edge-indiana-title");
    expect(beforeTitle).toContain("edge-garrett-unanimous");
    const afterTitle = activeEdges(EDGE_POOL, at("2027-01-18T17:00:00Z")).map((e) => e.id);
    expect(afterTitle).not.toContain("edge-indiana-title");
    expect(afterTitle).toContain("edge-garrett-unanimous");
  });

  it("edge of the day draws from the active pool", () => {
    for (let d = 0; d < EDGE_POOL.length; d++) {
      const day = new Date(SEP_24.getTime() + d * 86_400_000);
      expect(edgeOfTheDay(undefined, day).market).toBeUndefined();
    }
  });
});
