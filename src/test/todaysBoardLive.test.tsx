import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// QC round 5 regression (Sep 24 2026), on the surface where it was found:
// MLB Trending -> Today's Board showed yesterday's final ("Cardinals 5
// Pirates 1") beside today's first pitch, because live games were matched by
// team names only while ESPN's default scoreboard was still on the 23rd.

const board = vi.hoisted(() => ({ rowDate: "", events: [] as unknown[] }));

vi.mock("@/integrations/supabase/client", () => {
  const builderFor = (t: string): Record<string | symbol, unknown> => {
    const rows =
      t === "mlb_games"
        ? [
            {
              id: "g-today",
              date: board.rowDate,
              status: "STATUS_SCHEDULED",
              home_team_name: "Pittsburgh Pirates",
              visitor_team_name: "St. Louis Cardinals",
              venue: "PNC Park",
              starting_pitcher_home: "Paul Skenes",
              starting_pitcher_away: "Kyle Leahy",
            },
          ]
        : [];
    const b: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get: (_x, prop) =>
          prop === "then"
            ? (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
            : prop === "maybeSingle" || prop === "single"
              ? async () => ({ data: null, error: null })
              : () => b,
      }
    );
    return b;
  };
  return { supabase: { from: (t: string) => builderFor(t) } };
});
vi.mock("@/hooks/useMlbProbables", () => ({ useMlbProbables: () => ({ data: undefined }) }));

import { TodaysBoard } from "@/components/dashboard/TodaysBoard";

const espnEvent = (date: string, state: "pre" | "in" | "post", away: number, home: number) => ({
  id: "401817063",
  date,
  status: { type: { state, shortDetail: state === "post" ? "Final" : "Top 3rd" } },
  competitions: [
    {
      competitors: [
        { homeAway: "home", score: String(home), team: { displayName: "Pittsburgh Pirates" } },
        { homeAway: "away", score: String(away), team: { displayName: "St. Louis Cardinals" } },
      ],
    },
  ],
});

afterEach(() => vi.unstubAllGlobals());

const renderBoard = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TodaysBoard sport="MLB" />
    </QueryClientProvider>
  );

describe("Today's Board live scores in a series", { timeout: 20_000 }, () => {
  it("does not put yesterday's final next to today's first pitch", async () => {
    const start = new Date(Date.now() + 60_000); // today's game, later today
    board.rowDate = start.toISOString();
    const yesterday = new Date(start.getTime() - 18 * 3600_000).toISOString();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ events: [espnEvent(yesterday, "post", 5, 1)] }))));
    renderBoard();
    await waitFor(() => expect(screen.getAllByText(/Pirates/).length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 300)); // let the scoreboard query land
    expect(screen.queryByText("5")).toBeNull();
    expect(screen.queryByText("1")).toBeNull();
  });

  it("still shows today's live game on its row", async () => {
    const start = new Date(Date.now() + 60_000);
    board.rowDate = start.toISOString();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ events: [espnEvent(start.toISOString(), "in", 2, 0)] }))));
    renderBoard();
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
