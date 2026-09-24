import { describe, it, expect } from "vitest";
import { replaceBoard, type BoardRow } from "../../supabase/functions/sync-draft-board/replace";

type Stored = BoardRow & { captured_at: number };

// In-memory stand-in for the replace_draft_board SQL function with the same
// contract: calls serialize behind a lock (pg_advisory_xact_lock), a newer
// capture on the board refuses the call, rows from strictly older captures
// are deleted, and anything but exactly this capture remaining rolls back.
// The SQL itself is exercised against real Postgres separately; this pins
// down how replaceBoard and overlapping syncs behave around it.
function fakeBoardDb(initial: Stored[] = []) {
  const board = new Map(initial.map((r) => [r.player_name, r]));
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  let lock: Promise<unknown> = Promise.resolve();

  const swap = (args: Record<string, unknown>) => {
    const capture = Date.parse(args.p_capture as string);
    const rows = args.p_rows as BoardRow[];
    if ([...board.values()].some((r) => r.captured_at > capture)) {
      return { data: null, error: { message: "a capture newer than this one is already on the board; this run is superseded" } };
    }
    const before = new Map(board);
    for (const r of rows) board.set(r.player_name, { ...r, captured_at: capture });
    let pruned = 0;
    for (const [name, r] of board) {
      if (r.captured_at < capture) {
        board.delete(name);
        pruned++;
      }
    }
    if (board.size !== rows.length) {
      board.clear();
      for (const [k, v] of before) board.set(k, v); // rollback
      return { data: null, error: { message: `${board.size} rows after the swap, expected ${rows.length}` } };
    }
    return { data: { rows: board.size, pruned }, error: null };
  };

  return {
    board,
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      const result = lock.then(() => swap(args));
      lock = result;
      return result;
    },
  };
}

const capture = (label: string, n: number, source = "DraftTek"): BoardRow[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1,
    player_name: `${label} ${i + 1}`,
    position: "QB",
    school: "Notre Dame",
    height: null,
    weight: null,
    source,
    source_as_of: "2026-09-24",
  }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("replaceBoard", () => {
  it("hands the whole capture to replace_draft_board in one call", async () => {
    const db = fakeBoardDb();
    const rows = capture("DT", 3);
    await expect(replaceBoard(db, 2027, rows, "2026-09-26T05:00:00.000Z")).resolves.toEqual({ rows: 3, pruned: 0 });
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]).toEqual({
      fn: "replace_draft_board",
      args: { p_draft_year: 2027, p_capture: "2026-09-26T05:00:00.000Z", p_rows: rows },
    });
    // The payload carries no captured_at or draft_year: SQL stamps both
    expect(Object.keys(rows[0])).not.toContain("captured_at");
  });

  it("replaces an older board with a mixed-punctuation overlap and prunes the rest", async () => {
    const old: Stored[] = [
      { ...capture("Tank", 1)[0], player_name: "CJ Carr", rank: 11, source: "Tankathon", captured_at: Date.parse("2026-09-19T05:00:14Z") },
      { ...capture("Tank", 1)[0], player_name: "Tae Johnson", rank: 22, source: "Tankathon", captured_at: Date.parse("2026-09-19T05:00:14Z") },
    ];
    const db = fakeBoardDb(old);
    const rows = [
      { ...capture("DT", 1)[0], player_name: "C.J. Carr", rank: 26 },
      { ...capture("DT", 1)[0], player_name: "Tae Johnson", rank: 16 },
    ];
    await expect(replaceBoard(db, 2027, rows, "2026-09-26T05:00:00Z")).resolves.toEqual({ rows: 2, pruned: 1 });
    expect([...db.board.keys()].sort()).toEqual(["C.J. Carr", "Tae Johnson"]);
  });

  it("throws, and says the swap rolled back, when the SQL function raises", async () => {
    const db = {
      rpc: async () => ({ data: null, error: { message: "a capture newer than ... is already on the 2027 board; this run is superseded" } }),
    };
    await expect(replaceBoard(db, 2027, capture("DT", 2), "2026-09-26T05:00:00Z")).rejects.toThrow(
      /rolled back: .*superseded/
    );
  });

  it("throws when the function reports a different row count than it was given", async () => {
    const db = { rpc: async () => ({ data: { rows: 199, pruned: 0 }, error: null }) };
    await expect(replaceBoard(db, 2027, capture("DT", 200), "2026-09-26T05:00:00Z")).rejects.toThrow(
      /reported 199 rows, expected 200/
    );
  });

  it("refuses an empty capture without touching the database", async () => {
    const db = fakeBoardDb();
    await expect(replaceBoard(db, 2027, [], "2026-09-26T05:00:00Z")).rejects.toThrow(/empty capture/);
    expect(db.calls).toHaveLength(0);
  });
});

describe("overlapping syncs", () => {
  // QC's repro: two runs 1.5s apart used to leave the board EMPTY in 12 of
  // 20 interleavings while both reported success. Run A captured first, run
  // B 1.5s later; how long each spends fetching decides which swap lands
  // first. Every interleaving must end with B's full board, never empty.
  const interleavings = Array.from({ length: 20 }, (_, i) => ({
    aDelay: (i * 7) % 13,
    bDelay: (i * 5) % 11,
  }));

  it.each(interleavings)("A waits $aDelay ms, B waits $bDelay ms: board ends as B's full capture", async ({ aDelay, bDelay }) => {
    const old: Stored[] = capture("Tank", 118, "Tankathon").map((r) => ({
      ...r,
      captured_at: Date.parse("2026-09-19T05:00:14Z"),
    }));
    const db = fakeBoardDb(old);
    const runA = sleep(aDelay).then(() => replaceBoard(db, 2027, capture("A", 200), "2026-09-26T05:00:00.000Z"));
    const runB = sleep(bDelay).then(() => replaceBoard(db, 2027, capture("B", 200), "2026-09-26T05:00:01.500Z"));
    const [a, b] = await Promise.allSettled([runA, runB]);

    expect(b.status).toBe("fulfilled"); // the newer capture always lands
    expect(db.board.size).toBe(200); // never empty, never mixed
    expect([...db.board.keys()].every((name) => name.startsWith("B "))).toBe(true);
    if (a.status === "rejected") {
      // A reached the lock after B: refused loudly, not applied
      expect(String(a.reason)).toMatch(/superseded/);
    }
  });

  it("exercises both orders across the interleavings", async () => {
    const outcomes = new Set<string>();
    for (const { aDelay, bDelay } of interleavings) {
      const db = fakeBoardDb();
      const runA = sleep(aDelay).then(() => replaceBoard(db, 2027, capture("A", 5), "2026-09-26T05:00:00.000Z"));
      const runB = sleep(bDelay).then(() => replaceBoard(db, 2027, capture("B", 5), "2026-09-26T05:00:01.500Z"));
      const [a] = await Promise.allSettled([runA, runB]);
      outcomes.add(a.status);
    }
    // A sometimes lands first (then B replaces it), sometimes is superseded
    expect(outcomes).toEqual(new Set(["fulfilled", "rejected"]));
  });
});
