import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { queryView } from "@/lib/queryView";

// MLB QC round 3 (Sep 24 2026): empty-state copy only after a SUCCESSFUL read.
// React Query 5 reports a paused first fetch (offline, or a retry held while
// the tab is hidden) as neither loading nor error; the MLB pages used to fall
// through to "No active hit streaks right now" / "No qualified hitters yet".

const db = vi.hoisted(() => ({ result: { data: [] as unknown[], error: null as null | { message: string } } }));

vi.mock("@/integrations/supabase/client", () => {
  // Any query chain resolves to db.result (range() for paged reads, await for the rest)
  const builder: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(db.result);
        if (prop === "range" || prop === "maybeSingle") return async () => db.result;
        return () => builder;
      },
    }
  );
  return { supabase: { from: () => builder } };
});
vi.mock("@/hooks/useLiveScores", () => ({ useLiveScores: () => ({ getGame: () => undefined, anyLive: false }) }));
vi.mock("@/hooks/useMlbProbables", () => ({ useMlbProbables: () => ({ data: undefined }) }));
vi.mock("@/services/mlb/batterVsPitcher", () => ({ careerVsPitcher: async () => ({ status: "unavailable" }) }));
vi.mock("@/components/ui/FollowButton", () => ({ FollowButton: () => null }));

import MLBPlayers from "@/pages/MLBPlayers";
import MLBPlayerDetail from "@/pages/MLBPlayerDetail";

const EMPTY_COPY = [/No active hit streaks/, /No qualified hitters yet/];

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderPlayers = () =>
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>
        <MLBPlayers />
      </MemoryRouter>
    </QueryClientProvider>
  );

afterEach(() => {
  onlineManager.setOnline(true);
  db.result = { data: [], error: null };
});

describe("queryView", () => {
  it("maps React Query 5 states to what a screen may show", () => {
    expect(queryView({ data: undefined, status: "pending", fetchStatus: "fetching" })).toBe("loading");
    expect(queryView({ data: undefined, status: "pending", fetchStatus: "paused" })).toBe("waiting");
    expect(queryView({ data: undefined, status: "error", fetchStatus: "idle" })).toBe("error");
    expect(queryView({ data: undefined, status: "error", fetchStatus: "fetching" })).toBe("loading"); // retry in flight
    expect(queryView({ data: undefined, status: "error", fetchStatus: "paused" })).toBe("waiting");
    expect(queryView({ data: [], status: "success", fetchStatus: "idle" })).toBe("ready");
    expect(queryView({ data: [1], status: "error", fetchStatus: "idle" })).toBe("ready"); // keep last good data
  });
});

describe("MLB Players page", () => {
  it("waits, rather than claiming there are no streaks, when the first read is paused", async () => {
    onlineManager.setOnline(false);
    renderPlayers();
    await waitFor(() => expect(screen.getAllByText("Waiting for a connection…").length).toBe(2));
    for (const copy of EMPTY_COPY) expect(screen.queryByText(copy)).toBeNull();
  });

  it("shows an error with Retry, not empty-state copy, when the read fails", async () => {
    db.result = { data: null as unknown as unknown[], error: { message: "AbortError: signal is aborted" } };
    renderPlayers();
    await waitFor(() => expect(screen.getByText("Couldn't load hit streaks.")).toBeInTheDocument());
    expect(screen.getByText("Couldn't load MLB hitters.")).toBeInTheDocument();
    for (const copy of EMPTY_COPY) expect(screen.queryByText(copy)).toBeNull();
  });

  it("shows the empty states only after a read that succeeded and came back empty", async () => {
    renderPlayers();
    await waitFor(() => expect(screen.getByText(/No active hit streaks/)).toBeInTheDocument());
    expect(screen.getByText(/No qualified hitters yet/)).toBeInTheDocument();
  });
});

describe("MLB player detail page", () => {
  const renderDetail = () =>
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/dashboard/mlb/players/abc"]}>
          <Routes>
            <Route path="/dashboard/mlb/players/:playerId" element={<MLBPlayerDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

  it("waits instead of saying Player not found when the first read is paused", async () => {
    onlineManager.setOnline(false);
    renderDetail();
    await waitFor(() => expect(screen.getByText("Waiting for a connection…")).toBeInTheDocument());
    expect(screen.queryByText("Player not found.")).toBeNull();
  });

  it("says Player not found only after a successful read with no player", async () => {
    db.result = { data: null as unknown as unknown[], error: null };
    renderDetail();
    await waitFor(() => expect(screen.getByText("Player not found.")).toBeInTheDocument());
  });
});
