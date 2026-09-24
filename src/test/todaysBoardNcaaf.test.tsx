import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// QC, Sep 24 2026: the NCAAF Trending board loaded .limit(40) of the 71 games
// in its 72h window, so the Saturday chip showed 34 of 65 games and stopped at
// the 2:00 PM PT window, dropping seven ranked matchups (Texas A&M @ LSU among
// them). This builds a 71-game window and checks every Saturday game renders.

type Row = Record<string, unknown>;

// Kickoffs between 16:00Z and 23:59Z land on the same calendar day in UTC and
// in Pacific time, so this holds wherever the test runs.
const at = (day: string, minutes: number) => new Date(Date.parse(`${day}T16:00:00Z`) + minutes * 60_000).toISOString();
const game = (id: string, date: string, away: string, home: string): Row => ({
  id,
  date,
  status: "STATUS_SCHEDULED",
  home_team_name: home,
  visitor_team_name: away,
  home_team_id: null,
  visitor_team_id: null,
  venue: `${home} Stadium`,
  time_tbd: false,
});

const games: Row[] = [
  game("thu-1", at("2026-09-24", 450), "Liberty Flames", "Coastal Carolina Chanticleers"),
  ...Array.from({ length: 5 }, (_, i) => game(`fri-${i}`, at("2026-09-25", i * 60), `Friday Away${i}`, `Friday Home${i}`)),
  ...Array.from({ length: 64 }, (_, i) => game(`sat-${i}`, at("2026-09-26", i * 6), `Saturday Away${i}`, `Saturday Home${i}`)),
  // the 71st: a late-afternoon kickoff the 40-row cap used to cut
  game("sat-am-lsu", at("2026-09-26", 450), "Texas A&M Aggies", "LSU Tigers"),
];

const rangesAsked: Array<[number, number]> = [];

function query(table: string): unknown {
  let range: [number, number] | null = null;
  let inIds: unknown[] | null = null;
  const special: Record<string, unknown> = {};
  // Any other chained filter (select, gte, eq, order, ...) passes through
  const q: unknown = new Proxy(special, {
    get: (t, prop) => (prop in t ? t[prop as string] : () => q),
  });
  special.range = (from: number, to: number) => {
    range = [from, to];
    if (table === "ncaaf_games") rangesAsked.push(range);
    return q;
  };
  special.in = (_col: string, ids: unknown[]) => {
    inIds = ids;
    return q;
  };
  // A fixed .limit() on the games window is exactly what must not come back
  special.limit = () => {
    if (table === "ncaaf_games") throw new Error(`${table}: capped with .limit(); page with .range() instead`);
    return q;
  };
  special.then = (resolve: (v: unknown) => void) => {
    if (table === "ncaaf_games") {
      const sorted = [...games].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return resolve({ data: range ? sorted.slice(range[0], range[1] + 1) : sorted, error: null });
    }
    if (table === "ncaaf_odds") {
      return resolve({
        data: (inIds || []).map((id) => ({
          game_id: id,
          spread_value: -3.5,
          spread_odds: -110,
          moneyline_home: -165,
          moneyline_away: 140,
          total_value: 51.5,
          total_over_odds: -110,
          total_under_odds: -110,
        })),
        error: null,
      });
    }
    return resolve({ data: [], error: null });
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => query(t) } }));
vi.mock("@/hooks/useLiveScores", () => ({ useLiveScores: () => ({ getGame: () => undefined, anyLive: false }) }));
vi.mock("@/data/trendingBets", () => ({ trendingFor: () => [] }));

import { TodaysBoard } from "@/components/dashboard/TodaysBoard";

describe("TodaysBoard (NCAAF): the whole window", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-24T09:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("lists all 65 Saturday games, including the ones past the old 40-row cap", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TodaysBoard sport="NCAAF" />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Sat Sep 26/i }));
    await screen.findByText("Saturday Home0");
    // Team names as rendered in the grid rows, collected once (a name with no
    // ESPN school entry, like these fixtures, shows whole)
    const names = new Set([...document.querySelectorAll("span.truncate")].map((s) => s.textContent?.trim()));
    const missing = Array.from({ length: 64 }, (_, i) => `Saturday Home${i}`).filter((n) => !names.has(n));
    expect(missing).toEqual([]);
    // Real schools read the way ESPN names them, never by mascot
    expect(names.has("Texas A&M") && names.has("LSU")).toBe(true);
    expect(names.has("Aggies") || names.has("Tigers")).toBe(false);
    // Paged, and one request covers a 71-game window
    expect(rangesAsked[0]).toEqual([0, 499]);
  }, 15_000);

  it("stacks the price columns under the matchup below the sm breakpoint only", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TodaysBoard sport="NCAAF" />
      </QueryClientProvider>,
    );
    const header = (await screen.findAllByText("Matchup"))[0];
    expect(header.className).toContain("hidden sm:block");
    const row = (await screen.findAllByText("Liberty"))[0].closest("div.grid") as HTMLElement;
    expect(row.className).toContain("grid-cols-3");
    expect(row.className).toContain("sm:grid-cols-[1fr_88px_88px_88px]");
    expect((row.firstElementChild as HTMLElement).className).toContain("col-span-3 sm:col-span-1");
  });
});
