import { describe, it, expect } from "vitest";

/**
 * Tests for sync-nfl-players edge function data transforms.
 *
 * The edge function runs in Deno and can't be imported directly.
 * We replicate the pure transform logic here as contract tests.
 */

// ── parseWeight (replicated from sync-nfl-players/index.ts:121-126) ──

function parseWeight(weight: string | number | undefined | null): number | null {
  if (weight === undefined || weight === null) return null;
  if (typeof weight === "number") return weight;
  const match = String(weight).match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

describe("parseWeight", () => {
  it('parses "305 lbs" → 305', () => {
    expect(parseWeight("305 lbs")).toBe(305);
  });

  it('parses "225" (no unit) → 225', () => {
    expect(parseWeight("225")).toBe(225);
  });

  it("passes through numeric value", () => {
    expect(parseWeight(210)).toBe(210);
  });

  it("returns null for undefined", () => {
    expect(parseWeight(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseWeight(null)).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(parseWeight("unknown")).toBeNull();
  });
});

// ── Skill position filtering ─────────────────────────────────────────

const SKILL_POSITIONS = [
  "Quarterback", "Running Back", "Wide Receiver", "Tight End", "Fullback",
  "QB", "RB", "WR", "TE", "FB",
];

function filterSkillPositions<T extends { position?: string | null }>(players: T[]): T[] {
  return players.filter((p) => SKILL_POSITIONS.includes(p.position || ""));
}

describe("Skill position filtering", () => {
  it("keeps QBs", () => {
    const players = [{ position: "Quarterback" }, { position: "QB" }];
    expect(filterSkillPositions(players)).toHaveLength(2);
  });

  it("keeps RBs, WRs, TEs, FBs", () => {
    const players = [
      { position: "Running Back" },
      { position: "Wide Receiver" },
      { position: "Tight End" },
      { position: "Fullback" },
    ];
    expect(filterSkillPositions(players)).toHaveLength(4);
  });

  it("drops OL, DL, LB, CB, S, K, P", () => {
    const players = [
      { position: "Offensive Lineman" },
      { position: "Defensive Lineman" },
      { position: "Linebacker" },
      { position: "Cornerback" },
      { position: "Safety" },
      { position: "Kicker" },
      { position: "Punter" },
    ];
    expect(filterSkillPositions(players)).toHaveLength(0);
  });

  it("drops null/missing positions", () => {
    const players = [{ position: null }, { position: undefined }, {}];
    expect(filterSkillPositions(players)).toHaveLength(0);
  });

  it("filters a mixed roster correctly", () => {
    const players = [
      { position: "Quarterback" },
      { position: "Offensive Lineman" },
      { position: "Wide Receiver" },
      { position: "Linebacker" },
      { position: "Running Back" },
      { position: "Cornerback" },
    ];
    const result = filterSkillPositions(players);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.position)).toEqual([
      "Quarterback",
      "Wide Receiver",
      "Running Back",
    ]);
  });
});

// ── Player data mapping (BDL → upsert shape) ────────────────────────

interface BDLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  team?: {
    id: number;
    full_name: string;
    abbreviation: string;
  };
  jersey_number?: string;
  height?: string;
  weight?: string | number;
  college?: string;
  years_exp?: number;
}

function mapBDLPlayer(player: BDLPlayer) {
  return {
    external_id: String(player.id),
    sport: "NFL",
    name: `${player.first_name || ""} ${player.last_name || ""}`.trim(),
    first_name: player.first_name || null,
    last_name: player.last_name || null,
    position: player.position || null,
    team_id: player.team?.id ? String(player.team.id) : null,
    team_name: player.team?.full_name || null,
    team_abbr: player.team?.abbreviation || null,
    jersey_number: player.jersey_number || null,
    height: player.height || null,
    weight: parseWeight(player.weight),
    college: player.college || null,
    experience: player.years_exp || null,
    status: "active",
  };
}

describe("BDL player data mapping", () => {
  const samplePlayer: BDLPlayer = {
    id: 12345,
    first_name: "Josh",
    last_name: "Allen",
    position: "Quarterback",
    team: {
      id: 4,
      full_name: "Buffalo Bills",
      abbreviation: "BUF",
    },
    jersey_number: "17",
    height: "6-5",
    weight: "237 lbs",
    college: "Wyoming",
    years_exp: 7,
  };

  it("maps external_id as string", () => {
    expect(mapBDLPlayer(samplePlayer).external_id).toBe("12345");
  });

  it("sets sport to NFL", () => {
    expect(mapBDLPlayer(samplePlayer).sport).toBe("NFL");
  });

  it("builds full name from first + last", () => {
    expect(mapBDLPlayer(samplePlayer).name).toBe("Josh Allen");
  });

  it("parses weight string to number", () => {
    expect(mapBDLPlayer(samplePlayer).weight).toBe(237);
  });

  it("maps team fields", () => {
    const mapped = mapBDLPlayer(samplePlayer);
    expect(mapped.team_id).toBe("4");
    expect(mapped.team_name).toBe("Buffalo Bills");
    expect(mapped.team_abbr).toBe("BUF");
  });

  it("handles missing team gracefully", () => {
    const noTeam = { ...samplePlayer, team: undefined };
    const mapped = mapBDLPlayer(noTeam);
    expect(mapped.team_id).toBeNull();
    expect(mapped.team_name).toBeNull();
    expect(mapped.team_abbr).toBeNull();
  });

  it("handles missing optional fields", () => {
    const minimal: BDLPlayer = {
      id: 99,
      first_name: "Test",
      last_name: "Player",
      position: "WR",
    };
    const mapped = mapBDLPlayer(minimal);
    expect(mapped.name).toBe("Test Player");
    expect(mapped.jersey_number).toBeNull();
    expect(mapped.height).toBeNull();
    expect(mapped.weight).toBeNull();
    expect(mapped.college).toBeNull();
    expect(mapped.experience).toBeNull();
  });
});
