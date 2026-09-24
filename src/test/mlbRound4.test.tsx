import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ProbableMatchup, PitcherLine } from "../../supabase/functions/_shared/mlb-statsapi";

// MLB QC round 4 (Sep 24 2026):
// 1) Game Insights shows its error + Retry when a read fails (it used to drop
//    "Hot Bats" silently), 2) one-line starters carry the same Projected / TBD
//    labels as every other surface, 5) player detail's OPP column shows the
//    opponent, 6) a failed slate refresh keeps the last good slate.

type Result = { data: unknown; error: null | { message: string } };
const db = vi.hoisted(() => ({ tables: {} as Record<string, Result> }));

vi.mock("@/integrations/supabase/client", () => {
  const builderFor = (table: string): Record<string | symbol, unknown> => {
    const result = () => db.tables[table] ?? { data: [], error: null };
    const b: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result());
          if (prop === "range" || prop === "maybeSingle" || prop === "single") return async () => result();
          return () => b;
        },
      }
    );
    return b;
  };
  return { supabase: { from: (t: string) => builderFor(t) } };
});
vi.mock("@/hooks/useLiveScores", () => ({ useLiveScores: () => ({ getGame: () => undefined, anyLive: false }) }));
vi.mock("@/hooks/useMlbProbables", () => ({ useMlbProbables: () => ({ data: undefined }) }));
vi.mock("@/hooks/useMarketPulse", () => ({
  useMarketPulse: () => ({ pulse: null, isLoading: false, isError: false, refetch: () => {} }),
}));
vi.mock("@/components/games/MarketPulse", () => ({ MarketPulse: () => null }));
vi.mock("@/components/ui/FollowButton", () => ({ FollowButton: () => null }));

import { GameInsightsSheet } from "@/components/games/GameInsightsSheet";
import { InlineStarters } from "@/components/mlb/ProbablePitcher";
import MLBPlayerDetail from "@/pages/MLBPlayerDetail";
import { MLBSlate } from "@/components/dashboard/MLBSlate";

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterEach(() => {
  db.tables = {};
});

// jsdom has neither; the player page's count-up and chart use them.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", ObserverStub);
vi.stubGlobal("ResizeObserver", ObserverStub);

const cubsGame = {
  id: "g1",
  date: "2026-09-24T18:20:00Z",
  home_team_name: "Chicago Cubs",
  visitor_team_name: "Miami Marlins",
  venue: "Wrigley Field",
  starting_pitcher_home: "Matthew Boyd",
  starting_pitcher_away: "Tyler Phillips",
};

describe("Game Insights sheet reads", () => {
  const renderSheet = () =>
    render(
      <QueryClientProvider client={client()}>
        <GameInsightsSheet sport="MLB" game={cubsGame} open onOpenChange={() => {}} />
      </QueryClientProvider>
    );

  it("shows its error state with Retry when a read fails, instead of silently dropping Hot Bats", async () => {
    db.tables.players = { data: null, error: { message: "AbortError: signal is aborted" } };
    renderSheet();
    await waitFor(() => expect(screen.getByText("Couldn't load game intel.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows Hot Bats when the reads succeed", async () => {
    db.tables.players = { data: [{ id: "p1", name: "Seiya Suzuki", team_name: "Chicago Cubs", team_abbr: "CHC" }], error: null };
    db.tables.player_season_stats = {
      data: [{ player_id: "p1", hit_streak: 5, hit_streak_avg: 0.304, batting_avg: 0.267 }],
      error: null,
    };
    renderSheet();
    await waitFor(() => expect(screen.getByText("Hot Bats in This Game")).toBeInTheDocument());
    expect(screen.getByText(/Seiya Suzuki/)).toBeInTheDocument();
  });
});

describe("InlineStarters (Today's Board rows)", () => {
  const line = (name: string, extra: Partial<PitcherLine> = {}): PitcherLine => ({
    id: 1, name, hand: "R", season: null, last3: null, ...extra,
  });
  const matchup = (away: PitcherLine | null, home: PitcherLine | null) => ({ game: {} as ProbableMatchup["game"], away, home });

  it("labels projected starters, keeps announced ones plain, and says TBD", () => {
    render(<div><InlineStarters matchup={matchup(line("Clay Holmes", { projected: true }), line("Jake Bennett", { projected: true }))} /></div>);
    expect(screen.getByText("Holmes")).toBeInTheDocument();
    expect(screen.getAllByText("Projected")).toHaveLength(2);
  });

  it("shows TBD for an unresolved side and nothing when both are unknown", () => {
    const { container, rerender } = render(<div><InlineStarters matchup={matchup(null, line("Andrew Alvarez"))} /></div>);
    expect(container.textContent).toBe(" · TBD vs Alvarez");
    rerender(<div><InlineStarters matchup={matchup(null, null)} /></div>);
    expect(container.textContent).toBe("");
  });

  it("falls back to synced names only while MLB's data is missing", () => {
    const { container } = render(<div><InlineStarters matchup={undefined} fallbackAway="Kyle Leahy" fallbackHome="Paul Skenes" /></div>);
    expect(container.textContent).toBe(" · Leahy vs Skenes");
  });
});

describe("MLB player detail OPP column", () => {
  it("shows the opponent from opponent_name, as MLB's abbreviation", async () => {
    db.tables.players = { data: { id: "abc", name: "Dominic Canzone", team_name: "Seattle Mariners", team_abbr: "SEA", position: "RF", headshot_url: null }, error: null };
    db.tables.player_season_stats = { data: { batting_avg: 0.262, ops: 0.815, home_runs: 22, rbi: 60, at_bats: 461, hit_streak: 12, hit_streak_avg: 0.34 }, error: null };
    db.tables.player_game_logs = {
      data: [
        { game_date: "2026-09-23", hits: 2, at_bats: 5, home_runs: 0, rbi: 1, opponent_abbr: null, opponent_name: "Houston Astros" },
        { game_date: "2026-09-22", hits: 1, at_bats: 4, home_runs: 0, rbi: 0, opponent_abbr: null, opponent_name: "Athletics" },
      ],
      error: null,
    };
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/dashboard/mlb/players/abc"]}>
          <Routes>
            <Route path="/dashboard/mlb/players/:playerId" element={<MLBPlayerDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText("HOU")).toBeInTheDocument());
    expect(screen.getByText("ATH")).toBeInTheDocument();
  });
});

describe("MLB slate refresh", () => {
  it("keeps the last good slate and notes a failed refresh after reconnect", async () => {
    db.tables.mlb_games = {
      data: [{ ...cubsGame, id: "g1", status: "STATUS_SCHEDULED", date: new Date(Date.now() + 3600e3).toISOString() }],
      error: null,
    };
    db.tables.mlb_odds = { data: [], error: null };
    render(
      <QueryClientProvider client={client()}>
        <MLBSlate />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText("Chicago Cubs")).toBeInTheDocument());

    db.tables.mlb_games = { data: null, error: { message: "network down" } };
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(screen.getByText("Couldn't refresh. Showing the last loaded slate.")).toBeInTheDocument());
    expect(screen.getByText("Chicago Cubs")).toBeInTheDocument(); // slate still there
    expect(screen.queryByText("Couldn't load today's games.")).toBeNull(); // no error card
  });

  it("shows the error card only when there is no slate yet", async () => {
    db.tables.mlb_games = { data: null, error: { message: "network down" } };
    render(
      <QueryClientProvider client={client()}>
        <MLBSlate />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText("Couldn't load today's games.")).toBeInTheDocument());
    expect(screen.queryByText(/No upcoming games/)).toBeNull();
  });
});
