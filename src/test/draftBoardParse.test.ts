import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseBigBoard } from "../../supabase/functions/sync-draft-board/parse";

// Fixture is a trimmed capture of the real Tankathon big board (Aug 2026):
// <title> + the first board render (ranks 1-101) + the start of the section
// that follows, whose ranks restart - exercising the monotonic-rank stop.
const html = readFileSync(
  resolve(__dirname, "fixtures/tankathon-big-board.html"),
  "utf-8"
);

describe("parseBigBoard", () => {
  const { draftYear, prospects } = parseBigBoard(html);

  it("reads the draft year from the page title", () => {
    expect(draftYear).toBe(2027);
  });

  it("extracts the full Top 101 and stops when ranks restart", () => {
    expect(prospects.length).toBeGreaterThanOrEqual(95);
    expect(prospects.length).toBeLessThanOrEqual(101);
    const ranks = prospects.map((p) => p.rank);
    expect(ranks[0]).toBe(1);
    // strictly increasing - never bleeds into the next board section
    expect(ranks.every((r, i) => i === 0 || r > ranks[i - 1])).toBe(true);
  });

  it("extracts name, position, school, and measurements for the top prospect", () => {
    const top = prospects[0];
    expect(top.player_name).toBe("Jeremiah Smith");
    expect(top.position).toBe("WR");
    expect(top.school).toBe("Ohio State");
    expect(top.height).toBe("6'3\"");
    expect(top.weight).toBe(223);
  });

  it("produces resolver-compatible school names on every row", () => {
    for (const p of prospects) {
      expect(p.school.length).toBeGreaterThan(0);
      expect(p.school).not.toMatch(/&#?\w+;/); // entities decoded
    }
  });

  it("returns an empty board (→ loud sync failure) on unrecognized markup", () => {
    const result = parseBigBoard("<html><body>redesigned page</body></html>");
    expect(result.prospects).toEqual([]);
    expect(result.draftYear).toBeNull();
  });
});
