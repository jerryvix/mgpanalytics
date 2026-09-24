import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ProbableMatchup, PitcherLine } from "../../supabase/functions/_shared/mlb-statsapi";

// The Active Hit Streaks table: MLB QC round 2 (Sep 24 2026).
// - a team with no game today reads "Off today" + "Next: Fri vs ...", never as tonight
// - projected starters are labeled; unresolved ones are TBD, not a bare name
// - a failed load shows an error with Retry, never "No active hit streaks"

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useLiveScores", () => ({ useLiveScores: () => ({ getGame: () => undefined, anyLive: false }) }));
vi.mock("@/services/mlb/batterVsPitcher", () => ({ careerVsPitcher: async () => ({ status: "unavailable" }) }));

let mockProbables: ProbableMatchup[] | undefined;
vi.mock("@/hooks/useMlbProbables", () => ({ useMlbProbables: () => ({ data: mockProbables }) }));

import { HitStreakTable, type HitStreakRow } from "@/components/mlb/HitStreakTable";
import { resolveMatchup } from "@/services/mlb/streakMatchup";

const line = (name: string, extra: Partial<PitcherLine> = {}): PitcherLine => ({
  id: 1,
  name,
  hand: "L",
  season: { wins: 3, losses: 6, era: 5.04, whip: 1.47, strikeouts: 80, walks: 30, inningsPitched: "103.2", gamesStarted: 20, games: 20 },
  last3: null,
  ...extra,
});

const game = (gamePk: number, gameDate: string, away: string, home: string): ProbableMatchup["game"] => ({
  gamePk,
  gameDate,
  officialDate: gameDate.slice(0, 10),
  scheduleDay: gameDate.slice(0, 10),
  isPlaceholder: false,
  startTimeTBD: false,
  gameNumber: 1,
  gameType: "R",
  detailedState: "Scheduled",
  state: "pre",
  status: "STATUS_SCHEDULED",
  isFinal: false,
  venue: null,
  weather: null,
  away: { id: 1, name: away, score: null, probable: null },
  home: { id: 2, name: home, score: null, probable: null },
});

const row = (extra: Partial<HitStreakRow>): HitStreakRow => ({
  playerId: "p1",
  name: "Vladimir Guerrero Jr.",
  team: "TOR",
  teamName: "Toronto Blue Jays",
  streak: 5,
  seasonAvg: 0.263,
  streakAvg: 0.313,
  nextOpponent: null,
  nextOpponentAbbr: null,
  nextPitcher: null,
  nextGameDate: null,
  ...extra,
});

// Thursday Sep 24 2026, noon Pacific. Toronto is off; its next game is Reds at Blue Jays, Fri 4:07 PM PT.
const NOW = Date.parse("2026-09-24T19:00:00Z");
const friday: ProbableMatchup = {
  game: game(822760, "2026-09-25T23:07:00Z", "Cincinnati Reds", "Toronto Blue Jays"),
  away: line("Nick Lodolo"),
  home: null,
};
const thursday: ProbableMatchup = {
  game: game(823326, "2026-09-24T22:05:00Z", "St. Louis Cardinals", "Pittsburgh Pirates"),
  away: line("Kyle Leahy", { hand: "R" }),
  home: line("Tarik Skubal", { projected: true }),
};

describe("resolveMatchup", () => {
  it("flags a team with no game today and names the day of its next one", () => {
    const m = resolveMatchup(row({}), [friday, thursday], (t) => (t === "Cincinnati Reds" ? "CIN" : null), NOW);
    expect(m.offToday).toBe(true);
    expect(m.nextDay).toBe("Fri");
    expect(m.opponentAbbr).toBe("CIN");
    expect(m.pitcherName).toBe("Nick Lodolo");
  });

  it("does not flag a team that plays today", () => {
    const m = resolveMatchup(row({ teamName: "St. Louis Cardinals", team: "STL" }), [friday, thursday], undefined, NOW);
    expect(m.offToday).toBe(false);
    expect(m.pitcherLine?.projected).toBe(true);
  });

  it("uses the synced names only when MLB's data is missing", () => {
    const r = row({ nextOpponent: "Cincinnati Reds", nextPitcher: "Nick Lodolo", nextGameDate: "2026-09-25T23:07:00Z" });
    expect(resolveMatchup(r, undefined, undefined, NOW)).toMatchObject({ pitcherName: "Nick Lodolo", offToday: false });
    // MLB loaded, but its game has no starter we can stand behind: TBD, not the synced name
    const tbd = resolveMatchup(r, [{ ...friday, away: null }], undefined, NOW);
    expect(tbd.pitcherName).toBeNull();
  });
});

const renderTable = (props: Parameters<typeof HitStreakTable>[0]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <HitStreakTable {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe("HitStreakTable", () => {
  it("says Off today and Next: Fri instead of implying tonight", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    mockProbables = [friday, thursday];
    renderTable({ rows: [row({})], teamAbbr: (t) => (t === "Cincinnati Reds" ? "CIN" : null) });
    expect(screen.getAllByText("Off today").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Next: Fri vs/).length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("labels a projected starter", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    mockProbables = [friday, thursday];
    renderTable({ rows: [row({ teamName: "St. Louis Cardinals", team: "STL", playerId: "p2" })] });
    expect(screen.getAllByText("Projected").length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("shows an error with Retry, not the empty-state copy, when the load failed", () => {
    mockProbables = undefined;
    const onRetry = vi.fn();
    renderTable({ rows: [], isError: true, onRetry });
    expect(screen.getByText("Couldn't load hit streaks.")).toBeInTheDocument();
    expect(screen.queryByText(/No active hit streaks/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
