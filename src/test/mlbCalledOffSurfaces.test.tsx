import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// Final review, Sep 25 2026: a rescheduled Orioles @ Yankees left a phantom
// Saturday card on the slate. sync-mlb-games now moves such a row to its new
// date, and marks one that neither ESPN nor MLB lists on its date any more
// STATUS_POSTPONED, the status ESPN gives a rainout. Postponed and canceled
// games are not upcoming, so the slate and Today's Board hide them.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

// PostgREST stand-in: every filter passes except eq() and in()
function query(table: string): unknown {
  const filters: Array<[string, string, unknown]> = [];
  const special: Record<string, unknown> = {};
  const q: unknown = new Proxy(special, {
    get: (t, prop) => (prop in t ? t[prop as string] : () => q),
  });
  special.eq = (col: string, val: unknown) => {
    filters.push(["eq", col, val]);
    return q;
  };
  special.in = (col: string, vals: unknown[]) => {
    filters.push(["in", col, vals]);
    return q;
  };
  special.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    const rows = (db[table] ?? []).filter((r) =>
      filters.every(([op, col, val]) =>
        op === "eq" ? String(r[col]) === String(val) : (val as unknown[]).map(String).includes(String(r[col])),
      ),
    );
    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => query(t) } }));
vi.mock("@/hooks/useLiveScores", () => ({ useLiveScores: () => ({ getGame: () => undefined, anyLive: false }) }));
vi.mock("@/hooks/useMlbProbables", () => ({ useMlbProbables: () => ({ data: undefined }) }));
vi.mock("@/data/trendingBets", () => ({ trendingFor: () => [] }));
vi.mock("@/components/ui/FollowButton", () => ({ FollowButton: () => null }));

import { MLBSlate } from "@/components/dashboard/MLBSlate";
import { TodaysBoard } from "@/components/dashboard/TodaysBoard";

const renderWithQuery = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const game = (id: string, date: string, status: string, away: string, home: string) => ({
  id,
  external_id: `espn_mlb_${id}`,
  date,
  status,
  home_team_name: home,
  visitor_team_name: away,
  venue: null,
  starting_pitcher_home: null,
  starting_pitcher_away: null,
});

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
});

describe("MLB slate", () => {
  it("shows the moved game and hides a postponed one", async () => {
    db.mlb_games = [
      game("401817088", new Date(Date.now() + 3 * 3600e3).toISOString(), "STATUS_SCHEDULED", "Baltimore Orioles", "New York Yankees"),
      game("401817999", new Date(Date.now() + 5 * 3600e3).toISOString(), "STATUS_POSTPONED", "Toronto Blue Jays", "Tampa Bay Rays"),
    ];
    renderWithQuery(<MLBSlate />);
    expect(await screen.findByText("New York Yankees")).toBeInTheDocument();
    expect(screen.queryByText("Tampa Bay Rays")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Game insights:/ })).toHaveLength(1);
  });
});

describe("Today's Board (MLB)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T16:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists today's games but not a postponed or canceled one", async () => {
    db.mlb_games = [
      game("401817088", "2026-09-25T20:05:00Z", "STATUS_SCHEDULED", "Baltimore Orioles", "New York Yankees"),
      game("401817998", "2026-09-25T22:10:00Z", "STATUS_CANCELED", "Seattle Mariners", "Texas Rangers"),
      game("401817999", "2026-09-25T23:10:00Z", "STATUS_POSTPONED", "Toronto Blue Jays", "Tampa Bay Rays"),
    ];
    renderWithQuery(<TodaysBoard sport="MLB" />);
    expect(await screen.findByText("Yankees")).toBeInTheDocument();
    expect(screen.queryByText("Rays")).toBeNull();
    expect(screen.queryByText("Rangers")).toBeNull();
  });
});
