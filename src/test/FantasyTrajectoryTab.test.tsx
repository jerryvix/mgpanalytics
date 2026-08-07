import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FantasySeasonRank, FantasySecondHalfRank } from "@/hooks/useNFLFantasyProfile";

// Mock the data hook - these tests cover rendering, not fetching.
const mockProfile = vi.fn();
vi.mock("@/hooks/useNFLFantasyProfile", () => ({
  useNFLFantasyProfile: (...args: unknown[]) => mockProfile(...args),
}));

import { FantasyTrajectoryTab } from "@/components/nfl/FantasyTrajectoryTab";

const seasonRow = (season: number, rank: number, over: Partial<FantasySeasonRank> = {}): FantasySeasonRank => ({
  gsis_id: "00-0033553",
  season,
  player_name: "James Cook",
  position: "RB",
  pos_group: "RB",
  team: "BUF",
  total_std: 200,
  total_ppr: 250,
  games: 17,
  ppg_ppr: 14.7,
  position_rank: rank,
  ppg_position_rank: rank,
  ...over,
});

const secondHalf: FantasySecondHalfRank = {
  gsis_id: "00-0033553",
  season: 2025,
  player_name: "James Cook",
  pos_group: "RB",
  second_half_ppr: 150,
  second_half_games: 9,
  second_half_ppg: 16.7,
  second_half_rank: 4,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FantasyTrajectoryTab", () => {
  it("renders the full trajectory view for a multi-season player", () => {
    // Ascending arc (30 -> 18 -> 12 in the 3-season window) with a 2nd-half
    // rank 8 spots better than the season finish => strong closer
    mockProfile.mockReturnValue({
      seasons: [seasonRow(2022, 44), seasonRow(2023, 30), seasonRow(2024, 18), seasonRow(2025, 12)],
      latestSeason: 2025,
      secondHalf,
      isLoading: false,
      isError: false,
      matched: true,
    });
    render(<FantasyTrajectoryTab playerName="James Cook III" position="Running Back" teamAbbr="BUF" />);

    expect(screen.getByText("2025 Finish")).toBeInTheDocument();
    expect(screen.getByText("Positional Finish Trajectory")).toBeInTheDocument();
    expect(screen.getByText("Season Finishes")).toBeInTheDocument();
    expect(screen.getByText("2025 Closing Stretch")).toBeInTheDocument();
    // RB44 -> RB6 with a strong 2nd half: ascending + strong closer
    expect(screen.getByText("Ascending")).toBeInTheDocument();
    expect(screen.getByText("Strong Closer")).toBeInTheDocument();
  });

  it("renders the empty state when no history matches", () => {
    mockProfile.mockReturnValue({
      seasons: [],
      latestSeason: null,
      secondHalf: null,
      isLoading: false,
      isError: false,
      matched: false,
    });
    render(<FantasyTrajectoryTab playerName="Rookie Player" position="Wide Receiver" />);
    expect(screen.getByText(/No fantasy finish history found/)).toBeInTheDocument();
  });

  it("renders a single-season player without a chart and without crashing", () => {
    mockProfile.mockReturnValue({
      seasons: [seasonRow(2025, 20)],
      latestSeason: 2025,
      secondHalf: null,
      isLoading: false,
      isError: false,
      matched: true,
    });
    render(<FantasyTrajectoryTab playerName="Second Year Guy" position="RB" />);
    expect(screen.getByText(/Not enough history for a trajectory/)).toBeInTheDocument();
    expect(screen.getByText(/No weeks 10–18 data/)).toBeInTheDocument();
  });

  it("colors ranks green only for top-10 finishes (Jonathan Taylor 2025 case)", () => {
    // Full season RB4 (green), weeks 10-18 RB11 (neutral), 2023/2022 RB33 (neutral)
    mockProfile.mockReturnValue({
      seasons: [seasonRow(2022, 33), seasonRow(2023, 33), seasonRow(2024, 12), seasonRow(2025, 4)],
      latestSeason: 2025,
      secondHalf: { ...secondHalf, second_half_rank: 11 },
      isLoading: false,
      isError: false,
      matched: true,
    });
    render(<FantasyTrajectoryTab playerName="Jonathan Taylor" position="RB" teamAbbr="IND" />);

    const greens = (text: string) =>
      screen.getAllByText(text).filter((el) => el.closest(".text-terminal-green") || el.classList.contains("text-terminal-green"));
    expect(greens("RB4").length).toBeGreaterThan(0); // top-10 finish is green
    expect(greens("RB11")).toHaveLength(0); // 2nd-half RB11 is not
    expect(greens("RB33")).toHaveLength(0); // old RB33 finishes are not
  });

  it("handles null ranks in season rows without crashing", () => {
    mockProfile.mockReturnValue({
      seasons: [
        seasonRow(2024, 30, { ppg_position_rank: null }),
        seasonRow(2025, 25, { total_ppr: null, ppg_ppr: null }),
      ],
      latestSeason: 2025,
      secondHalf: { ...secondHalf, second_half_games: 2 },
      isLoading: false,
      isError: false,
      matched: true,
    });
    render(<FantasyTrajectoryTab playerName="Banged Up" position="TE" />);
    expect(screen.getByText("Season Finishes")).toBeInTheDocument();
  });
});
