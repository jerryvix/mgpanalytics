import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PitcherLine, ProbableMatchup } from "../../supabase/functions/_shared/mlb-statsapi";
import { etDate } from "../../supabase/functions/_shared/mlb-statsapi";

// Owner feedback (Sep 24 2026): the MLB games page was too busy, so the slate
// cards show each probable starter's name, hand and Projected tag only. The
// pitching lines stay in Game Insights, the Hit Streaks table and chat.

// Hoisted: the vi.mock factories below run before the rest of this file
const fx = vi.hoisted(() => {
  const gameDate = new Date(Date.now() + 3 * 3600e3).toISOString();
  return {
    gameDate,
    game: {
      id: "g1",
      status: "STATUS_SCHEDULED",
      date: gameDate,
      home_team_name: "Chicago Cubs",
      visitor_team_name: "Miami Marlins",
      venue: "Wrigley Field",
      starting_pitcher_home: "Matthew Boyd",
      starting_pitcher_away: "Tyler Phillips",
    },
  };
});

const pitcher = (name: string, hand: string, extra: Partial<PitcherLine> = {}): PitcherLine => ({
  id: name.length,
  name,
  hand,
  season: {
    wins: 13,
    losses: 7,
    era: 3.21,
    whip: 1.09,
    strikeouts: 171,
    walks: 40,
    inningsPitched: "162.2",
    gamesStarted: 28,
    games: 28,
  },
  last3: { starts: [], ip: "17.1", era: 2.6, whip: 1.0, strikeouts: 19, walks: 4 },
  ...extra,
});

const matchups: ProbableMatchup[] = [
  {
    game: {
      gameDate: fx.gameDate,
      scheduleDay: etDate(fx.gameDate),
      isPlaceholder: false,
      away: { name: "Miami Marlins" },
      home: { name: "Chicago Cubs" },
    } as unknown as ProbableMatchup["game"],
    away: pitcher("Tyler Phillips", "R", { projected: true }),
    home: pitcher("Matthew Boyd", "L"),
  },
];

vi.mock("@/integrations/supabase/client", () => {
  const builderFor = (table: string): Record<string | symbol, unknown> => {
    const result = () => ({ data: table === "mlb_games" ? [fx.game] : [], error: null });
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
vi.mock("@/hooks/useMlbProbables", () => ({ useMlbProbables: () => ({ data: matchups }) }));
vi.mock("@/components/ui/FollowButton", () => ({ FollowButton: () => null }));

import { MLBSlate } from "@/components/dashboard/MLBSlate";
import { ProbablePitcherRow } from "@/components/mlb/ProbablePitcher";

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("MLB slate cards: starters without stat lines", () => {
  it("shows each starter's name, hand and Projected tag but no pitching numbers", async () => {
    const { container } = render(
      <QueryClientProvider client={client()}>
        <MLBSlate />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText("Matthew Boyd")).toBeInTheDocument());
    expect(screen.getByText("Tyler Phillips")).toBeInTheDocument();
    expect(screen.getByText("LHP")).toBeInTheDocument();
    expect(screen.getByText("RHP")).toBeInTheDocument();
    expect(screen.getByText("Projected")).toBeInTheDocument();

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bERA\b/);
    expect(text).not.toMatch(/WHIP/);
    expect(text).not.toContain("17.1 IP"); // last-starts line
    expect(text).not.toContain("3.21");
    expect(text).not.toContain("162.2 IP");
  });
});

describe("ProbablePitcherRow", () => {
  it("keeps the full pitching line by default (Game Insights)", () => {
    const { container } = render(<ProbablePitcherRow teamName="Chicago Cubs" line={pitcher("Matthew Boyd", "L")} />);
    const text = container.textContent ?? "";
    expect(text).toContain("3.21");
    expect(text).toContain("WHIP");
    expect(text).toContain("17.1 IP"); // last-starts line
  });

  it("drops the numbers, including the hover title, when showStats is off", () => {
    const { container } = render(
      <ProbablePitcherRow teamName="Chicago Cubs" line={pitcher("Matthew Boyd", "L")} showStats={false} />
    );
    expect(container.textContent).toContain("Matthew Boyd");
    expect(container.textContent).not.toMatch(/ERA|WHIP|17\.1 IP/);
    expect(container.querySelector("[title]")?.getAttribute("title")).toBe("Matthew Boyd");
  });
});
