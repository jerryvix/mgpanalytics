import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { pickLiveGame, sameScheduledGame, toScoreboardIndex, type LiveGame } from "@/lib/liveScores";

// QC round 5 (Sep 24 2026): at 10:36 UTC ESPN's default scoreboard was still on
// Sep 23, and matching live games by team names alone put yesterday's final
// ("Cardinals 5 Pirates 1") on 10 of today's 12 series rows.

const game = (id: string, startTime: string, state: LiveGame["state"], extra: Partial<LiveGame> = {}): LiveGame => ({
  espnId: id,
  awayName: "St. Louis Cardinals",
  homeName: "Pittsburgh Pirates",
  awayScore: state === "pre" ? null : 5,
  homeScore: state === "pre" ? null : 1,
  state,
  detail: state === "post" ? "Final" : state === "in" ? "Top 3rd" : "9:35 AM",
  period: null,
  clock: null,
  startTime,
  ...extra,
});

const YESTERDAY_FINAL = game("y", "2026-09-23T22:40Z", "post");
const TODAY_LIVE = game("t", "2026-09-24T16:35Z", "in", { awayScore: 1, homeScore: 0 });
const TODAY_ROW = { start: "2026-09-24T16:35:00+00:00" };
const idx = (...games: LiveGame[]) => toScoreboardIndex(games);

describe("live game matching", () => {
  it("does not attach yesterday's final to today's game in the same series", () => {
    expect(pickLiveGame(idx(YESTERDAY_FINAL), "St. Louis Cardinals", "Pittsburgh Pirates", TODAY_ROW)).toBeUndefined();
  });

  it("attaches today's live game", () => {
    expect(pickLiveGame(idx(TODAY_LIVE), "St. Louis Cardinals", "Pittsburgh Pirates", TODAY_ROW)?.espnId).toBe("t");
    // and picks it over yesterday's when the board carries both
    expect(pickLiveGame(idx(YESTERDAY_FINAL, TODAY_LIVE), "St. Louis Cardinals", "Pittsburgh Pirates", TODAY_ROW)?.espnId).toBe("t");
  });

  it("matches a TBD kickoff by Eastern calendar date, not by hour", () => {
    const kick = { ...game("k", "2026-10-03T19:30Z", "in"), awayName: "Vanderbilt Commodores", homeName: "Georgia Bulldogs" };
    const tbdRow = { start: "2026-10-03T04:00:00+00:00", timeTbd: true }; // midnight-ET placeholder
    expect(pickLiveGame(idx(kick), "Vanderbilt Commodores", "Georgia Bulldogs", tbdRow)?.espnId).toBe("k");
    // the same placeholder read as a real time would be 15.5h off and miss
    expect(pickLiveGame(idx(kick), "Vanderbilt Commodores", "Georgia Bulldogs", { start: tbdRow.start })).toBeUndefined();
    // a game on another Eastern day never matches
    const nextDay = { ...kick, espnId: "n", startTime: "2026-10-04T16:00Z" };
    expect(pickLiveGame(idx(nextDay), "Vanderbilt Commodores", "Georgia Bulldogs", tbdRow)).toBeUndefined();
  });

  it("ties each half of a doubleheader to its own row", () => {
    const g1 = { ...game("g1", "2026-09-25T17:05Z", "post"), awayName: "Chicago Cubs", homeName: "Boston Red Sox" };
    const g2 = { ...game("g2", "2026-09-25T22:05Z", "pre"), awayName: "Chicago Cubs", homeName: "Boston Red Sox" };
    const board = idx(g1, g2);
    expect(pickLiveGame(board, "Chicago Cubs", "Boston Red Sox", { start: "2026-09-25T17:05:00Z" })?.espnId).toBe("g1");
    expect(pickLiveGame(board, "Chicago Cubs", "Boston Red Sox", { start: "2026-09-25T22:05:00Z" })?.espnId).toBe("g2");
  });

  it("keeps the old behavior when a caller has no start to compare", () => {
    expect(pickLiveGame(idx(YESTERDAY_FINAL), "St. Louis Cardinals", "Pittsburgh Pirates")?.espnId).toBe("y");
    expect(sameScheduledGame({ startTime: null }, TODAY_ROW)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Through the real hook and a real ESPN-shaped payload
// ---------------------------------------------------------------------------

const espnEvent = (id: string, date: string, state: "pre" | "in" | "post", away: number, home: number) => ({
  id,
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
const staleBoard = { events: [espnEvent("401817063", "2026-09-23T22:40Z", "post", 5, 1)] }; // Sep 23, still up at 10:36 UTC

afterEach(() => vi.unstubAllGlobals());

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe("useLiveScores().getGame", () => {
  it("ignores yesterday's final for today's row, and still finds it without a start", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(staleBoard))));
    const { useLiveScores } = await import("@/hooks/useLiveScores");
    const { result } = renderHook(() => useLiveScores("MLB"), { wrapper });
    await waitFor(() => expect(result.current.getGame("St. Louis Cardinals", "Pittsburgh Pirates")).toBeDefined());
    expect(result.current.getGame("St. Louis Cardinals", "Pittsburgh Pirates", TODAY_ROW)).toBeUndefined();
  });
});

// The slate card itself: before the fix it showed FINAL (and yesterday's 5-1)
vi.mock("@/integrations/supabase/client", () => {
  const rows = {
    mlb_games: [
      {
        id: "g-today",
        date: "2099-09-24T16:35:00+00:00", // well inside the slate window whatever "now" is
        status: "STATUS_SCHEDULED",
        home_team_name: "Pittsburgh Pirates",
        visitor_team_name: "St. Louis Cardinals",
        venue: "PNC Park",
        starting_pitcher_home: "Paul Skenes",
        starting_pitcher_away: "Kyle Leahy",
      },
    ],
    mlb_odds: [],
  } as Record<string, unknown[]>;
  const builderFor = (t: string): Record<string | symbol, unknown> => {
    const b: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get: (_x, prop) =>
          prop === "then" ? (resolve: (v: unknown) => void) => resolve({ data: rows[t] ?? [], error: null }) : () => b,
      }
    );
    return b;
  };
  return { supabase: { from: (t: string) => builderFor(t) } };
});
vi.mock("@/hooks/useMlbProbables", () => ({ useMlbProbables: () => ({ data: undefined }) }));
vi.mock("@/components/games/GameInsightsSheet", () => ({ GameInsightsSheet: () => null }));
vi.mock("@/components/ui/FollowButton", () => ({ FollowButton: () => null }));

// First render pulls in the whole slate module graph; allow for a loaded runner.
describe("MLB slate card in a series", { timeout: 20_000 }, () => {
  it("does not show yesterday's final on today's card", async () => {
    const stale = { events: [espnEvent("401817063", "2099-09-23T22:40Z", "post", 5, 1)] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(stale))));
    const { MLBSlate } = await import("@/components/dashboard/MLBSlate");
    render(<MLBSlate />, { wrapper });
    await waitFor(() => expect(screen.getByText("Pittsburgh Pirates")).toBeInTheDocument());
    // give the live scoreboard query time to resolve
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText("FINAL")).toBeNull();
    expect(screen.getByText("UPCOMING")).toBeInTheDocument();
  });
});
