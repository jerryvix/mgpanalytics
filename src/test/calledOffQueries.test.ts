import { describe, it, expect, vi, beforeEach } from "vitest";

// QC round 2 (Sep 25 2026): the dashboard read its 10 MLB games for the next
// 48 hours and only then dropped postponed and canceled ones, so a window
// holding only those came back empty instead of falling back to the week; the
// chat panel's "N games" count included them. Both now filter in the query.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

// PostgREST stand-in: not(ilike), gte, lte, order and limit applied to the table's rows
const ilike = (value: unknown, pattern: string) =>
  new RegExp(`^${pattern.split("%").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i").test(String(value ?? ""));
function query(table: string): unknown {
  const tests: Array<(r: Row) => boolean> = [];
  let limit = Infinity;
  let counted = false;
  const special: Record<string, unknown> = {};
  const q: unknown = new Proxy(special, { get: (t, prop) => (prop in t ? t[prop as string] : () => q) });
  special.select = (_cols: string, opts?: { count?: string }) => {
    counted = !!opts?.count;
    return q;
  };
  special.not = (col: string, op: string, val: string) => {
    if (op === "ilike") tests.push((r) => r[col] != null && !ilike(r[col], val));
    return q;
  };
  special.gte = (col: string, val: string) => {
    tests.push((r) => String(r[col]) >= val);
    return q;
  };
  special.lte = (col: string, val: string) => {
    tests.push((r) => String(r[col]) <= val);
    return q;
  };
  special.limit = (n: number) => {
    limit = n;
    return q;
  };
  special.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    const rows = (db[table] ?? []).filter((r) => tests.every((f) => f(r))).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const data = rows.slice(0, limit);
    return Promise.resolve({ data, error: null, count: counted ? rows.length : null }).then(resolve, reject);
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => query(t) } }));

import { upcomingMlbGames } from "@/services/mlb/upcomingGames";
import { loadMarketContext } from "@/hooks/useMarketContext";

const now = new Date("2026-09-29T12:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * 3600_000).toISOString();
const game = (id: string, hours: number, status: string) => ({ id, date: at(hours), status, home_team_name: "New York Yankees", visitor_team_name: "Detroit Tigers" });

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
});

describe("dashboard: next MLB games", () => {
  it("falls back to the week when the next 48 hours hold only called-off games", async () => {
    db.mlb_games = [
      game("wc3", 24, "STATUS_CANCELED"), // ALWC Game 3, not needed
      game("rainout", 30, "STATUS_POSTPONED"),
      game("alds1", 96, "STATUS_SCHEDULED"),
    ];
    expect((await upcomingMlbGames(now))?.map((g) => g.id)).toEqual(["alds1"]);
  });

  it("never lists a called-off game next to real ones", async () => {
    db.mlb_games = [game("wc3", 12, "STATUS_CANCELED"), game("wc2", 24, "STATUS_SCHEDULED"), game("done", -2, "STATUS_FINAL")];
    expect((await upcomingMlbGames(now))?.map((g) => g.id)).toEqual(["wc2"]);
  });
});

describe("chat panel: upcoming game count", () => {
  it("does not count postponed or canceled games", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      db.mlb_games = [
        game("a", 6, "STATUS_SCHEDULED"),
        game("b", 30, "STATUS_POSTPONED"),
        game("c", 54, "STATUS_CANCELED"),
        game("d", 78, "STATUS_FINAL"),
      ];
      expect(await loadMarketContext(["MLB"])).toEqual([{ sport: "MLB", gameCount: 1, week: null }]);
    } finally {
      vi.useRealTimers();
    }
  });
});
