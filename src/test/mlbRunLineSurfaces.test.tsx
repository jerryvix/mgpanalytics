import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// Final review, Sep 24 2026: the 21:00 UTC sync stored Rockies @ White Sox with
// a run line DraftKings hadn't posted yet (spread 0, no price) and the slate
// card read "RUN LINE: Sox +0 (N/A)". The sync now stores null, and every MLB
// surface shows its own empty state for a row stored before: the slate's N/A,
// Today's Board's "-", and no Run Line in Market Pulse. An August-style run-line
// open of 0 carried forward in odds_history no longer reads "Open PK".

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

// A tiny PostgREST stand-in: eq() and in() filter the table's rows, range() pages them
function query(table: string): unknown {
  const filters: Array<[string, string, unknown]> = [];
  let range: [number, number] | null = null;
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
  special.range = (from: number, to: number) => {
    range = [from, to];
    return q;
  };
  special.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    let rows = (db[table] ?? []).filter((r) =>
      filters.every(([op, col, val]) =>
        op === "eq" ? String(r[col]) === String(val) : (val as unknown[]).map(String).includes(String(r[col])),
      ),
    );
    if (range) rows = rows.slice(range[0], range[1] + 1);
    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => query(t) } }));
vi.mock("@/hooks/useLiveScores", () => ({ useLiveScores: () => ({ getGame: () => undefined, anyLive: false }) }));
vi.mock("@/hooks/useMlbProbables", () => ({ useMlbProbables: () => ({ data: undefined }) }));
vi.mock("@/data/trendingBets", () => ({ trendingFor: () => [] }));
vi.mock("@/components/ui/FollowButton", () => ({ FollowButton: () => null }));
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  },
);

import { MLBSlate } from "@/components/dashboard/MLBSlate";
import { TodaysBoard } from "@/components/dashboard/TodaysBoard";
import { GameInsightsSheet } from "@/components/games/GameInsightsSheet";

const renderWithQuery = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const GAME_ID = "e6016646-c4bb-4890-9ca0-fe9bc8b5e09b";
const soxGame = {
  id: GAME_ID,
  external_id: "espn_mlb_401817080",
  date: "2026-09-25T23:40:00Z",
  status: "STATUS_SCHEDULED",
  home_team_name: "Chicago White Sox",
  visitor_team_name: "Colorado Rockies",
  venue: "Rate Field",
  starting_pitcher_home: "Sean Burke",
  starting_pitcher_away: "Tomoyuki Sugano",
};
// The prod row the 21:00 UTC sync wrote
const storedRow = {
  game_id: GAME_ID,
  sportsbook: "draftkings",
  spread_value: 0,
  spread_odds: null,
  moneyline_home: -224,
  moneyline_away: 183,
  total_value: 8.5,
  total_over_odds: 104,
  total_under_odds: -126,
  updated_at: "2026-09-24T21:00:15.711Z",
};
const postedRow = { ...storedRow, spread_value: -1.5, spread_odds: 104, updated_at: "2026-09-25T01:00:00Z" };
// odds_history run-line captures whose open was recorded as 0 before the line was posted
const zeroOpens = ["Chicago White Sox", "Colorado Rockies"].map((team) => ({
  sport: "MLB",
  game_id: "espn_mlb_401817080",
  bookmaker: "draftkings",
  odds_type: "spread",
  team,
  opening_line: 0,
  current_line: team === "Chicago White Sox" ? -1.5 : 1.5,
  timestamp: "2026-09-25T01:00:00Z",
}));

const noPlusZero = () => expect(document.body.textContent).not.toMatch(/\+0(?![\d.])/);

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
});

describe("MLB slate card", () => {
  it("shows N/A for a run line DraftKings hasn't posted, not '+0 (N/A)'", async () => {
    db.mlb_games = [{ ...soxGame, date: new Date(Date.now() + 6 * 3600e3).toISOString() }];
    db.mlb_odds = [storedRow];
    renderWithQuery(<MLBSlate />);
    const runLine = (await screen.findByText("RUN LINE:")).parentElement as HTMLElement;
    expect(within(runLine).getByText("N/A")).toBeInTheDocument();
    expect(runLine).not.toHaveTextContent(/Sox/);
    // The moneyline and total still show
    expect(screen.getByText("-224")).toBeInTheDocument();
    expect(screen.getByText("8.5")).toBeInTheDocument();
    noPlusZero();
  });

  it("shows the run line once it is posted", async () => {
    db.mlb_games = [{ ...soxGame, date: new Date(Date.now() + 6 * 3600e3).toISOString() }];
    db.mlb_odds = [postedRow];
    renderWithQuery(<MLBSlate />);
    const runLine = (await screen.findByText("RUN LINE:")).parentElement as HTMLElement;
    expect(runLine).toHaveTextContent("White Sox -1.5 (+104)");
  });
});

describe("Today's Board (MLB)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T16:00:00Z"));
    db.mlb_games = [soxGame];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows '-' in the run line cells, never 0", async () => {
    db.mlb_odds = [storedRow];
    renderWithQuery(<TodaysBoard sport="MLB" />);
    expect(await screen.findByText("-224")).toBeInTheDocument();
    const row = screen.getByText("White Sox").closest("div.grid") as HTMLElement;
    expect(within(row).getAllByText("-")).toHaveLength(2); // both run line cells
    expect(within(row).queryByText("0")).toBeNull();
    expect(within(row).getByText("O 8.5 +104")).toBeInTheDocument();
    noPlusZero();
  });

  it("lists no run-line move from an open recorded as 0", async () => {
    db.mlb_odds = [postedRow];
    db.odds_history = zeroOpens;
    renderWithQuery(<TodaysBoard sport="MLB" />);
    expect(await screen.findByText("-1.5")).toBeInTheDocument();
    expect(screen.getByText("Lines are quiet - moves appear as books shift.")).toBeInTheDocument();
    expect(screen.queryByText(/0 → -1\.5|0 → \+1\.5/)).toBeNull();
  });
});

describe("Game Insights > Market Pulse (MLB)", () => {
  const renderSheet = () => renderWithQuery(<GameInsightsSheet sport="MLB" game={soxGame} open onOpenChange={() => {}} />);

  it("has no Run Line to show while DraftKings hasn't posted one (no 'PK')", async () => {
    db.mlb_odds = [storedRow];
    renderSheet();
    const tab = await screen.findByRole("tab", { name: "Run Line" });
    expect(tab).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Total" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("PK")).toBeNull();
    noPlusZero();
  });

  it("shows a posted run line without an 'Open PK' move from a 0 open", async () => {
    db.mlb_odds = [postedRow];
    db.odds_history = zeroOpens;
    renderSheet();
    expect(await screen.findByRole("tab", { name: "Run Line" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("+1.5")).toBeInTheDocument();
    expect(screen.getByText("-1.5")).toBeInTheDocument();
    expect(screen.queryByText(/Open PK/)).toBeNull();
    expect(screen.queryByText("PK")).toBeNull();
  });
});
