import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import type { ReactElement } from "react";

// Supabase reads resolve per table with whatever rows a test puts here; a
// test can make a table's read fail the way an aborted request does
const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  failing: new Set<string>(),
  from: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => {
  const chainFor = (table: string) => {
    const result = () =>
      mocks.failing.has(table)
        ? Promise.reject(new DOMException("The operation was aborted.", "AbortError"))
        : Promise.resolve({ data: mocks.rows[table] ?? [], error: null });
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
import { MarketPulse } from "@/components/games/MarketPulse";
import { buildMarketPulse } from "@/lib/marketPulse";

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...view, client };
}

const at = new Date(Date.now() - 20 * 60_000).toISOString();
const split = (gameId: string, market: string, side: string, bets: number, money: number) => ({
  game_id: gameId,
  market,
  side,
  bets_pct: bets,
  handle_pct: money,
  captured_at: at,
});
const line = (gameId: string, market: string, side: string, value: number | null, openValue: number | null) => ({
  game_id: gameId,
  market,
  side,
  line: value,
  price: -110,
  open_line: openValue,
  open_price: -110,
  captured_at: at,
});

// Real Week 4 captures (Sep 24 2026)
const liberty = [
  split("g-lib", "spread", "away", 79, 90),
  split("g-lib", "spread", "home", 21, 10),
  split("g-lib", "total", "over", 50, 55),
  split("g-lib", "total", "under", 50, 45),
];
const oklahoma = [split("g-ou", "spread", "away", 32, 65), split("g-ou", "spread", "home", 68, 35)];
const oklahomaLines = [line("g-ou", "spread", "away", 14, 10), line("g-ou", "spread", "home", -14, -10)];

describe("PublicBettingPreview (slate cards)", () => {
  beforeEach(() => {
    mocks.rows = { betting_splits: [...liberty, ...oklahoma], betting_lines: oklahomaLines };
    mocks.failing.clear();
    mocks.from.mockClear();
  });

  it("renders nothing, and reads nothing, for sports without stored splits", () => {
    for (const sport of ["NBA", "NCAAB", "MLB"]) {
      const { container, unmount } = renderWithQuery(
        <PublicBettingPreview sport={sport} gameId="g-lib" homeTeam="Home" awayTeam="Away" />,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("renders nothing for a game DraftKings has no split for", async () => {
    const { container, client } = renderWithQuery(
      <PublicBettingPreview sport="NCAAF" gameId="g-fcs" homeTeam="Rutgers Scarlet Knights" awayTeam="Howard Bison" />,
    );
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(mocks.from).toHaveBeenCalledWith("betting_splits");
    expect(container).toBeEmptyDOMElement();
  });

  it("shows DraftKings' real bets and money, never a line, and keeps taps off the card", async () => {
    const cardClick = vi.fn();
    renderWithQuery(
      <div onClick={cardClick}>
        <PublicBettingPreview sport="NCAAF" gameId="g-lib" homeTeam="Coastal Carolina Chanticleers" awayTeam="Liberty Flames" />
      </div>,
    );
    // Same orientation as the card's WinProbBar: home left, away right, both labeled
    const trigger = await screen.findByRole("button", {
      name: "DraftKings spread bets: Chanticleers 21%, Flames 79%",
    });
    expect(trigger).toHaveTextContent("Chanticleers 21%");
    expect(trigger).toHaveTextContent("79% Flames");
    expect(trigger).not.toHaveTextContent("Sharp"); // 90% money on 79% of bets is the crowd, not sharps

    fireEvent.click(trigger);
    expect(cardClick).not.toHaveBeenCalled();
    expect(await screen.findByText("Public side: Flames")).toBeInTheDocument();
    expect(screen.getAllByText("Money")).toHaveLength(2);
    expect(screen.getByText("Chanticleers 10%")).toBeInTheDocument();
    expect(screen.getByText("90% Flames")).toBeInTheDocument();
    expect(screen.getByText("Over 55%")).toBeInTheDocument();
    expect(screen.getByText("45% Under")).toBeInTheDocument();
    expect(screen.queryByText(/-2\.5|50\.5|-110/)).toBeNull();
  });

  it("tags the canonical sharp side and reads reverse moves from the stored line", async () => {
    renderWithQuery(<PublicBettingPreview sport="NCAAF" gameId="g-ou" homeTeam="Georgia Bulldogs" awayTeam="Oklahoma Sooners" />);
    const trigger = await screen.findByRole("button", { name: /DraftKings spread bets/i });
    expect(trigger).toHaveTextContent("Sharp: Sooners"); // 32% of bets, 65% of money
    fireEvent.click(trigger);
    // Georgia opened -10 and is -14: the line moved WITH the public, so no reverse move
    expect(await screen.findByText("Public side: Bulldogs · Sharp money: Sooners")).toBeInTheDocument();
  });

  it("holds a placeholder on a first read that is still out or paused offline, never an empty card", async () => {
    onlineManager.setOnline(false);
    try {
      const { container } = renderWithQuery(
        <PublicBettingPreview sport="NCAAF" gameId="g-lib" homeTeam="Coastal Carolina Chanticleers" awayTeam="Liberty Flames" />,
      );
      // React Query 5 pauses the read: neither loading nor error, and no data
      expect(screen.getByRole("status", { name: "Loading DraftKings splits" })).toBeInTheDocument();
      expect(container).not.toBeEmptyDOMElement();
      expect(mocks.from).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
    // Back online: the read resumes and the split replaces the placeholder
    expect(await screen.findByRole("button", { name: /DraftKings spread bets/i })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading DraftKings splits" })).toBeNull();
  });

  it("labels the split with DraftKings' page freshness, not the fetch time", async () => {
    const pageAt = new Date(Date.now() - 4 * 3600_000).toISOString();
    mocks.rows = { betting_splits: liberty.map((r) => ({ ...r, source_as_of: pageAt })), betting_lines: [] };
    renderWithQuery(<PublicBettingPreview sport="NCAAF" gameId="g-lib" homeTeam="Coastal Carolina Chanticleers" awayTeam="Liberty Flames" />);
    fireEvent.click(await screen.findByRole("button", { name: /DraftKings spread bets/i }));
    expect(await screen.findByText(/DraftKings · updated 4h ago/)).toBeInTheDocument();
  });

  it("says it couldn't load, with a retry, instead of looking like no split", async () => {
    mocks.failing.add("betting_splits");
    renderWithQuery(<PublicBettingPreview sport="NCAAF" gameId="g-lib" homeTeam="Coastal Carolina Chanticleers" awayTeam="Liberty Flames" />);
    expect(await screen.findByText("DK splits couldn't load.")).toBeInTheDocument();
    mocks.failing.clear();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(await screen.findByRole("button", { name: /DraftKings spread bets/i })).toBeInTheDocument();
  });
});

describe("MarketPulse", () => {
  const names = { sport: "MLB", awayName: "Chicago White Sox", homeName: "Chicago Cubs", spreadLabel: "Run Line" };
  const idle = { isLoading: false, isError: false, refetch: vi.fn() };

  it("shows both spread lines of a fallback and never a lone one-sided price", () => {
    const pulse = buildMarketPulse({
      splits: [],
      lines: [],
      odds: {
        spread_value: -1.5,
        spread_odds: -120, // home price only: the odds tables store no away spread price
        moneyline_home: -145,
        moneyline_away: 135,
        total_value: 7.5,
        total_over_odds: -112,
        total_under_odds: -108,
        updated_at: at,
      },
    });
    renderWithQuery(<MarketPulse {...names} state={{ ...idle, pulse }} />);
    expect(screen.getByText("+1.5")).toBeInTheDocument();
    expect(screen.getByText("-1.5")).toBeInTheDocument();
    expect(screen.queryByText("-120")).toBeNull();
    expect(screen.getByText(/line updated 20m ago/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Total" }));
    expect(screen.getByText("-112")).toBeInTheDocument();
    expect(screen.getByText("-108")).toBeInTheDocument();
  });

  it("shows Open X → Now Y from DraftKings' open for the selected market", () => {
    const pulse = buildMarketPulse({ splits: [], lines: oklahomaLines, odds: null });
    renderWithQuery(
      <MarketPulse sport="NCAAF" awayName="Oklahoma Sooners" homeName="Georgia Bulldogs" spreadLabel="Spread" state={{ ...idle, pulse }} />,
    );
    expect(screen.getByText("Open +10 → Now +14")).toBeInTheDocument();
  });

  it("shows a retry on a failed load, never the empty-state copy", () => {
    const refetch = vi.fn();
    renderWithQuery(<MarketPulse {...names} state={{ pulse: null, isLoading: false, isError: true, refetch }} />);
    expect(screen.getByText("Couldn't load DraftKings data.")).toBeInTheDocument();
    expect(screen.queryByText(/No DraftKings line posted/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the empty-state copy for a market that truly has no line", () => {
    renderWithQuery(
      <MarketPulse {...names} state={{ ...idle, pulse: buildMarketPulse({ splits: [], lines: [], odds: null }) }} />,
    );
    expect(screen.getByText(/No DraftKings line posted for this game yet/)).toBeInTheDocument();
  });
});
