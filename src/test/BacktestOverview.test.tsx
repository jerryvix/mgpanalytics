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
  it("renders the three source cards", () => {
    mockLoaded();
    render(<BacktestOverview />);

    expect(screen.getByText("Season Props")).toBeInTheDocument();
    expect(screen.getByText("Team Win Totals")).toBeInTheDocument();
    expect(screen.getByText("Fantasy ADP")).toBeInTheDocument();
  });

  it("renders sub-threshold archetype buckets as raw counts with no trend label", () => {
    mockLoaded();
    render(<BacktestOverview />);

    // Year 1 bucket has 3 player-seasons -> raw counts, explicit "not a trend"
    const raw = screen.getAllByText(/beat ADP in \d+ of 3 player-seasons \(n < 50 - not a trend\)/i);
    expect(raw.length).toBeGreaterThanOrEqual(1);
  });

  it("gives trend treatment only to buckets clearing the sample floor", () => {
    mockLoaded();
    render(<BacktestOverview />);

    // The veteran bucket (n=60) renders a computed rate, not a raw-counts line
    expect(screen.queryByText(/beat ADP in \d+ of 60 player-seasons/i)).toBeNull();
    // ...and carries either a TREND badge or the near-baseline read
    const treated = [
      ...screen.queryAllByText(/TREND/),
      ...screen.queryAllByText(/near baseline/i),
    ];
    expect(treated.length).toBeGreaterThanOrEqual(1);
  });

  it("splits the leaderboard into healthy-season and injury-outlier views", () => {
    mockLoaded();
    render(<BacktestOverview />);

    expect(screen.getByText(`${SEASON} Biggest Misses`)).toBeInTheDocument();
    // Default = the signal view
    expect(screen.getByText(/this is the signal view/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Injury outliers"));
    expect(screen.getByText(/do not draw market conclusions here/i)).toBeInTheDocument();
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
