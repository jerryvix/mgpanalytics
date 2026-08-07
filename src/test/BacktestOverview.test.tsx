import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { PlayerSeasonRow, PropResultRow, WinTotalResultRow } from "@/hooks/useBacktest";

// Mock the data hook - these tests cover rendering rules (push footnote,
// sub-threshold raw counts, leaderboard split), not fetching.
const mockBacktest = vi.fn();
vi.mock("@/hooks/useBacktest", () => ({
  useBacktest: () => mockBacktest(),
}));

import { BacktestOverview } from "@/components/players/backtest/BacktestOverview";

const SEASON = 2025;

// 60 veteran RBs (round 1, same team), clearing MIN_TREND_SAMPLE, plus 3
// rookies, which must render as raw counts with no trend styling.
function playerSeasons(): PlayerSeasonRow[] {
  const rows: PlayerSeasonRow[] = [];
  for (let i = 0; i < 60; i++) {
    rows.push({
      season: SEASON,
      gsis_id: `00-vet-${i}`,
      player_name: `Veteran Back ${i}`,
      position: "RB",
      team: "BUF",
      adp: i + 1,
      adp_pos_rank: (i % 40) + 1,
      finish_pos_rank: ((i + 5) % 45) + 1,
      games: i % 3 === 0 ? 10 : 16, // mix of injury-shaped and healthy
      experience_year: 5,
      draft_round: 1,
      new_team: false,
    });
  }
  for (let i = 0; i < 3; i++) {
    rows.push({
      season: SEASON,
      gsis_id: `00-rook-${i}`,
      player_name: `Rookie Back ${i}`,
      position: "RB",
      team: "DET",
      adp: 100 + i,
      adp_pos_rank: 41 + i,
      finish_pos_rank: 30 + i,
      games: 17,
      experience_year: 1,
      draft_round: 2,
      new_team: null,
    });
  }
  return rows;
}

const propRows: PropResultRow[] = [
  {
    season: SEASON, market: "pass_yards", subject_name: "QB One", gsis_id: "00-vet-0",
    position: "QB", line: 4000.5, over_odds: -110, under_odds: -110,
    actual: 4200, games_played: 17, result: "over", source: "manual_seed", book: "DK",
  },
  {
    season: SEASON, market: "rush_yards", subject_name: "RB Push", gsis_id: "00-vet-1",
    position: "RB", line: 1000, over_odds: -110, under_odds: -110,
    actual: 1000, games_played: 17, result: "push", source: "manual_seed", book: "DK",
  },
  {
    season: SEASON, market: "rec_yards", subject_name: "WR Miss", gsis_id: "00-vet-2",
    position: "WR", line: 1200.5, over_odds: null, under_odds: null,
    actual: 700, games_played: 16, result: "under", source: "manual_seed", book: null,
  },
];

const winRows: WinTotalResultRow[] = [
  {
    season: SEASON, subject_name: "Buffalo Bills", team_abbr: "BUF", line: 12.5,
    over_odds: -110, under_odds: -110, actual: 12, result: "under", book: "BetMGM",
  },
  {
    season: SEASON, subject_name: "Chicago Bears", team_abbr: "CHI", line: 8.5,
    over_odds: -110, under_odds: -110, actual: 11, result: "over", book: "BetMGM",
  },
];

function mockLoaded() {
  mockBacktest.mockReturnValue({
    lastCompleted: SEASON,
    props: { data: propRows },
    winTotals: { data: winRows },
    playerSeasons: { data: playerSeasons() },
    isLoading: false,
    isError: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BacktestOverview", () => {
  it("leads with the misses leaderboard; summary cards, positional table, and archetypes stay hidden", () => {
    mockLoaded();
    render(<BacktestOverview />);

    expect(screen.getByText("Biggest Market Movers")).toBeInTheDocument();
    // Hidden per owner feedback (Aug 2026) while the metrics get rethought
    expect(screen.queryByText("Season Props")).toBeNull();
    expect(screen.queryByText("Fantasy ADP")).toBeNull();
    expect(screen.queryByText("Positional Miss Rate")).toBeNull();
    expect(screen.queryByText("Archetype Trends (ADP vs Finish)")).toBeNull();
  });

  it("shows healthy seasons only, with no injury-outliers toggle", () => {
    mockLoaded();
    render(<BacktestOverview />);

    expect(screen.getByText("Biggest Market Movers")).toBeInTheDocument();
    expect(screen.getByText(/excluded as forecasting noise/i)).toBeInTheDocument();
    // The toggle was removed (owner call, Aug 2026)
    expect(screen.queryByText("Injury outliers")).toBeNull();
    expect(screen.queryByText("Healthy-season misses")).toBeNull();
  });

  it("collapses and re-expands a section on click, defaulting to open", () => {
    mockLoaded();
    render(<BacktestOverview />);

    // Default open: win-total content is visible immediately
    expect(screen.getByText("Exceeded Total")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Team Win Total Differential (Prior Year)"));
    expect(screen.queryByText("Exceeded Total")).toBeNull();

    fireEvent.click(screen.getByText("Team Win Total Differential (Prior Year)"));
    expect(screen.getByText("Exceeded Total")).toBeInTheDocument();
  });

  it("splits team win totals into an exceeded column and a missed column, signed and colored", () => {
    mockLoaded();
    render(<BacktestOverview />);

    expect(screen.getByText("Team Win Total Differential (Prior Year)")).toBeInTheDocument();
    expect(screen.getByText("Exceeded Total")).toBeInTheDocument();
    expect(screen.getByText("Missed Total")).toBeInTheDocument();
    // Bears beat their 8.5 total by 2.5 wins; Bills missed their 12.5 total by 0.5
    expect(screen.getByText("+2.5 W")).toBeInTheDocument();
    expect(screen.getByText("-0.5 W")).toBeInTheDocument();
  });

  it("shows the empty-state prompt when no season data exists", () => {
    mockBacktest.mockReturnValue({
      lastCompleted: SEASON,
      props: { data: [] },
      winTotals: { data: [] },
      playerSeasons: { data: [] },
      isLoading: false,
      isError: false,
    });
    render(<BacktestOverview />);
    expect(screen.getByText(/run the backtester backfills/i)).toBeInTheDocument();
  });
});
