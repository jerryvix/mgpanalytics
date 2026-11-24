import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chainFor = (table: string) => {
    const result = () => Promise.resolve({ data: mocks.rows[table] ?? [], error: null });
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "in", "order", "limit"]) chain[m] = () => chain;
    chain.range = result;
    chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad);
    return chain;
  };
  mocks.from.mockImplementation((table: string) => chainFor(table));
  return { supabase: { from: mocks.from } };
});

import { PublicBettingPreview } from "@/components/PublicBettingPreview";

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const at = new Date(Date.now() - 20 * 60_000).toISOString();

describe("market notes beside splits", () => {
  it("shows a credited note with a link, and does not treat it as the split", async () => {
    mocks.rows = {
      betting_splits: [
        { game_id: "g-was", market: "spread", side: "away", bets_pct: 25, handle_pct: 45, captured_at: at, source_as_of: at },
        { game_id: "g-was", market: "spread", side: "home", bets_pct: 75, handle_pct: 55, captured_at: at, source_as_of: at },
      ],
      betting_lines: [],
      market_notes: [{
        id: "n1",
        sport: "NFL",
        away_name: "Cincinnati Bengals",
        home_name: "Washington Commanders",
        credit: "John Ewing, BetMGM",
        body: "Bengals opened -4 now -6.5, 75% of bets / 55% of money on Bengals",
        url: "https://x.com/johnewing/status/9876543210",
        starts_at: new Date(Date.now() + 3600_000).toISOString(),
      }],
    };
    const cardClick = vi.fn();
    renderWithQuery(
      <div onClick={cardClick}>
        <PublicBettingPreview sport="NFL" gameId="g-was" homeTeam="Washington Commanders" awayTeam="Cincinnati Bengals" />
      </div>,
    );
    const link = await screen.findByRole("link", { name: "John Ewing, BetMGM" });
    expect(link).toHaveAttribute("href", "https://x.com/johnewing/status/9876543210");
    expect(screen.getByText("Market Note")).toBeInTheDocument();
    expect(screen.getByText(/75% of bets \/ 55% of money on Bengals/)).toBeInTheDocument();
    fireEvent.click(link);
    expect(cardClick).not.toHaveBeenCalled();
  });

  it("leaves a game with splits but no note unchanged", async () => {
    mocks.rows = {
      betting_splits: [
        { game_id: "g-was", market: "spread", side: "away", bets_pct: 25, handle_pct: 45, captured_at: at },
        { game_id: "g-was", market: "spread", side: "home", bets_pct: 75, handle_pct: 55, captured_at: at },
      ],
      betting_lines: [],
      market_notes: [],
    };
    renderWithQuery(
      <PublicBettingPreview sport="NFL" gameId="g-was" homeTeam="Washington Commanders" awayTeam="Cincinnati Bengals" />,
    );
    await waitFor(() => expect(screen.getByText(/DK spread bets/i)).toBeInTheDocument());
    expect(screen.queryByText("Market Note")).not.toBeInTheDocument();
  });
});
