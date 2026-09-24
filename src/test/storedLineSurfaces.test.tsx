import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// One DraftKings number per market on every surface (Sep 24 2026, round 4):
// Today's Board's odds grid and the NFL slate read the daily odds tables and
// could show a different number than Game Insights > Market Pulse for the same
// game. Both now take betting_lines by the shared rule (chooseLine), and the
// board's rails list a market once. Real captures from Sep 24 2026.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const failing = new Set<string>();
const tablesRead: string[] = [];

// A tiny PostgREST stand-in: eq() and in() filter the table's rows, range() pages them
function query(table: string): unknown {
  const filters: Array<[string, string, unknown]> = [];
  let range: [number, number] | null = null;
  const special: Record<string, unknown> = {};
  const q: unknown = new Proxy(special, {
    get: (t, prop) => (prop in t ? t[prop as string] : () => q),
  });
  special.eq = (col: string, val: unknown) => {
    filters.push(["eq", col, val]);
    return q;
  };
  special.in = (col: string, vals: unknown[]) => {
    filters.push(["in", col, vals]);
    return q;
  };
  special.range = (from: number, to: number) => {
    range = [from, to];
    return q;
  };
  special.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    tablesRead.push(table);
    if (failing.has(table)) return Promise.resolve({ data: null, error: { message: `${table} read failed` } }).then(resolve, reject);
    let rows = (db[table] ?? []).filter((r) =>
      filters.every(([op, col, val]) =>
        op === "eq" ? String(r[col]) === String(val) : (val as unknown[]).map(String).includes(String(r[col])),
      ),
    );
    if (range) rows = rows.slice(range[0], range[1] + 1);
    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => query(t) } }));
vi.mock("@/hooks/useLiveScores", () => ({ useLiveScores: () => ({ getGame: () => undefined, anyLive: false }) }));
vi.mock("@/data/trendingBets", () => ({ trendingFor: () => [] }));
// The slate card's CountUp (framer-motion useInView) needs one; jsdom has none
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  },
);

import { TodaysBoard } from "@/components/dashboard/TodaysBoard";
import { NFLSlate } from "@/components/dashboard/NFLSlate";

const renderWithQuery = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const LINES_AT = "2026-09-24T09:31:03.943Z";
const line = (sport: string, gameId: string, market: string, side: string, value: number | null, price: number, openLine: number | null, openPrice: number | null): Row => ({
  source: "draftkings",
  sport,
  game_id: gameId,
  market,
  side,
  line: value,
  price,
  open_line: openLine,
  open_price: openPrice,
  captured_at: LINES_AT,
});
const game = (id: string | number, date: string, away: string, home: string): Row => ({
  id,
  date,
  status: "STATUS_SCHEDULED",
  league: "NFL",
  home_team_name: home,
  visitor_team_name: away,
  time_tbd: false,
});
const hist = (team: string, type: string, open: number, current: number): Row => ({
  sport: "NCAAF",
  game_id: "espn_ncaaf_401858249",
  bookmaker: "draftkings",
  odds_type: type,
  team,
  opening_line: open,
  current_line: current,
  timestamp: "2026-09-24T08:52:01.983Z",
});

// NYJ @ DET: the NFL games sync wrote +240 / -298 at 06:15; DraftKings was +245 / -305 at 09:31
const nyjDetLines = [
  line("NFL", "1392251", "spread", "away", 6.5, -105, 9.5, -110),
  line("NFL", "1392251", "spread", "home", -6.5, -115, -9.5, -110),
  line("NFL", "1392251", "total", "over", 47.5, -108, 44.5, -110),
  line("NFL", "1392251", "total", "under", 47.5, -112, 44.5, -110),
  line("NFL", "1392251", "moneyline", "away", null, 245, null, 340),
  line("NFL", "1392251", "moneyline", "home", null, -305, null, -440),
];
const nyjDetOdds: Row = {
  id: "o-nyj",
  game_id: 1392251,
  sportsbook: "draftkings",
  spread_value: -6.5,
  spread_odds: -115,
  moneyline_home: -298,
  moneyline_away: 240,
  total_value: 47.5,
  total_over_odds: -108,
  total_under_odds: -112,
  updated_at: "2026-09-24T06:15:06.812Z",
};

const rail = (title: string) => screen.getByText(title).parentElement as HTMLElement;
// The odds grid only: the rails beside it now quote the same numbers
const grid = async () => within((await screen.findAllByText("Matchup"))[0].closest(".overflow-hidden") as HTMLElement);

describe("Today's Board (NCAAF): the stored line and one move per market", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-24T10:00:00Z"));
    for (const k of Object.keys(db)) delete db[k];
    Object.assign(db, {
      ncaaf_games: [
        game("g-lib", "2026-09-24T23:30:00Z", "Liberty Flames", "Coastal Carolina Chanticleers"),
        {
          ...game("df988ca5-ab79-400c-9f1b-d576d7708042", "2026-09-26T23:30:00Z", "Arizona Wildcats", "Washington State Cougars"),
          external_id: "espn_ncaaf_401856804",
        },
        // Miami's game THIS week; its Oct 3 game at Clemson is not on the board
        game("g-cmu", "2026-09-26T22:30:00Z", "Central Michigan Chippewas", "Miami Hurricanes"),
      ],
      ncaaf_odds: [
        // Arizona @ Washington State: the daily 08:18 row still had -395 / +310
        {
          game_id: "df988ca5-ab79-400c-9f1b-d576d7708042",
          sportsbook: "draftkings",
          spread_value: 10,
          spread_odds: -105,
          moneyline_home: 310,
          moneyline_away: -395,
          total_value: 48.5,
          total_over_odds: -110,
          total_under_odds: -110,
          updated_at: "2026-09-24T08:18:24.570Z",
        },
        // CMU @ Miami: DraftKings posts no moneyline on a 41.5-point spread
        {
          game_id: "g-cmu",
          sportsbook: "draftkings",
          spread_value: -41.5,
          spread_odds: -112,
          moneyline_home: null,
          moneyline_away: null,
          total_value: 58.5,
          total_over_odds: -110,
          total_under_odds: -110,
          updated_at: "2026-09-24T08:18:24.570Z",
        },
        // Liberty @ Coastal Carolina: an odds row captured AFTER the stored line, with a new number
        {
          game_id: "g-lib",
          sportsbook: "draftkings",
          spread_value: 3,
          spread_odds: -110,
          moneyline_home: 120,
          moneyline_away: -142,
          total_value: 50.5,
          total_over_odds: -105,
          total_under_odds: -115,
          updated_at: "2026-09-24T09:50:00.000Z",
        },
      ],
      betting_lines: [
        line("NCAAF", "df988ca5-ab79-400c-9f1b-d576d7708042", "spread", "away", -10, -115, -13.5, -110),
        line("NCAAF", "df988ca5-ab79-400c-9f1b-d576d7708042", "spread", "home", 10, -105, 13.5, -110),
        line("NCAAF", "df988ca5-ab79-400c-9f1b-d576d7708042", "total", "over", 48.5, -110, 48.5, -110),
        line("NCAAF", "df988ca5-ab79-400c-9f1b-d576d7708042", "total", "under", 48.5, -110, 48.5, -110),
        line("NCAAF", "df988ca5-ab79-400c-9f1b-d576d7708042", "moneyline", "away", null, -440, null, -575),
        line("NCAAF", "df988ca5-ab79-400c-9f1b-d576d7708042", "moneyline", "home", null, 340, null, 425),
        line("NCAAF", "g-lib", "spread", "away", -2.5, -112, 1.5, -110),
        line("NCAAF", "g-lib", "spread", "home", 2.5, -108, -1.5, -110),
        line("NCAAF", "g-lib", "total", "over", 50.5, -105, 54.5, -110),
        line("NCAAF", "g-lib", "total", "under", 50.5, -115, 54.5, -110),
        line("NCAAF", "g-lib", "moneyline", "away", null, -135, null, 100),
        line("NCAAF", "g-lib", "moneyline", "home", null, 114, null, -120),
      ],
      odds_history: [
        // Miami @ Clemson, Oct 3: big moves, but not a game on the board
        hist("Miami Hurricanes", "spread", -7, -17.5),
        hist("Clemson Tigers", "spread", 7, 17.5),
        hist("Miami Hurricanes", "moneyline", -360, -900),
        hist("Clemson Tigers", "moneyline", 285, 600),
        // Arizona @ WSU's 08:52 snapshot: its "current" +310 is older than the grid's +340
        { ...hist("Arizona Wildcats", "moneyline", -575, -395), game_id: "espn_ncaaf_401856804" },
        { ...hist("Washington State Cougars", "moneyline", 425, 310), game_id: "espn_ncaaf_401856804" },
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows DraftKings' stored number where it is the fresher capture, both spread prices included", async () => {
    renderWithQuery(<TodaysBoard sport="NCAAF" />);
    fireEvent.click(await screen.findByRole("button", { name: /Sat Sep 26/i }));
    expect(await screen.findByText("-440")).toBeInTheDocument(); // Arizona, as in Market Pulse
    expect(screen.getByText("+340")).toBeInTheDocument();
    expect(screen.queryByText("-395")).toBeNull();
    expect(screen.queryByText("+310")).toBeNull();
    expect(screen.getByText("-10 -115")).toBeInTheDocument(); // the away side's own price
    expect(screen.getByText("+10 -105")).toBeInTheDocument();
  });

  it("keeps the odds row's number where that row is the later, different capture, without a lopsided price", async () => {
    renderWithQuery(<TodaysBoard sport="NCAAF" />);
    const g = await grid();
    expect(await g.findByText("-142")).toBeInTheDocument(); // Liberty ML moved after 09:31
    expect(g.getByText("+120")).toBeInTheDocument();
    // The spread moved too, and the odds table has no away price: numbers only
    expect(g.getByText("-3")).toBeInTheDocument();
    expect(g.getByText("+3")).toBeInTheDocument();
    // The total did not move: the stored pair, prices and all
    expect(g.getByText("O 50.5 -105")).toBeInTheDocument();
    expect(g.getByText("U 50.5 -115")).toBeInTheDocument();
  });

  it("reads the rails from DraftKings' open to the grid's own numbers, one entry per market, board games only", async () => {
    renderWithQuery(<TodaysBoard sport="NCAAF" />);
    await (await grid()).findByText("-142");
    const sharpest = rail("Sharpest Moves");
    // Liberty's spread moved +1.5 to -3 (the odds row's later number, as the grid shows it)
    expect(within(sharpest).getByText("Flames Spread")).toBeInTheDocument();
    expect(within(sharpest).getByText("+1.5 → -3")).toBeInTheDocument();
    expect(within(sharpest).getByText("Cougars Spread")).toBeInTheDocument();
    expect(within(sharpest).getByText("+13.5 → +10")).toBeInTheDocument();
    // One side per market, and nothing from a game that is not on the board
    expect(within(sharpest).queryByText("Chanticleers Spread")).toBeNull();
    expect(within(sharpest).queryByText("Wildcats Spread")).toBeNull();
    expect(screen.queryByText(/Hurricanes (Spread|ML)|Tigers (Spread|ML)/)).toBeNull();
    const signal = rail("Market Signal");
    // Liberty's even-money open reads +100, never -100
    expect(within(signal).getByText("Flames ML")).toBeInTheDocument();
    expect(within(signal).getByText("steamed from +100")).toBeInTheDocument();
    expect(within(signal).getByText("dropping from 54.5")).toBeInTheDocument();
  });

  it("keys the grid's arrows by game: WSU's moneyline moved, CMU @ Miami's empty moneyline cell has no arrow", async () => {
    renderWithQuery(<TodaysBoard sport="NCAAF" />);
    fireEvent.click(await screen.findByRole("button", { name: /Sat Sep 26/i }));
    // +425 to +340 on WSU's own number (not the 08:52 snapshot's +310)
    expect((await screen.findByText("+340")).parentElement).toHaveTextContent("+340▲");
    expect(screen.getByText("-440").parentElement).toHaveTextContent("-440▼");
    const cmu = screen.getByText("Chippewas").closest("div.grid") as HTMLElement;
    expect(cmu).not.toHaveTextContent(/▲|▼/);
  });
});

describe("Today's Board (NFL)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
    for (const k of Object.keys(db)) delete db[k];
    Object.assign(db, {
      games: [game(1392251, "2026-09-27T17:00:00Z", "New York Jets", "Detroit Lions")],
      odds: [nyjDetOdds],
      betting_lines: nyjDetLines,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the stored line by our games.id and shows NYJ @ DET as DraftKings had it", async () => {
    renderWithQuery(<TodaysBoard sport="NFL" />);
    const g = await grid();
    expect(await g.findByText("+245")).toBeInTheDocument();
    expect(g.getByText("-305")).toBeInTheDocument();
    expect(screen.queryByText("+240")).toBeNull();
    expect(g.getByText("+6.5 -105")).toBeInTheDocument();
    expect(g.getByText("-6.5 -115")).toBeInTheDocument();
    expect(g.getByText("O 47.5 -108")).toBeInTheDocument();
    // The rail reads DraftKings' open to that same number
    expect(within(rail("Sharpest Moves")).getByText("+340 → +245")).toBeInTheDocument();
  });

  it("falls back to the odds table's number when the stored lines can't be read", async () => {
    failing.add("betting_lines");
    try {
      renderWithQuery(<TodaysBoard sport="NFL" />);
      expect(await screen.findByText("+240")).toBeInTheDocument();
      expect(screen.getByText("-298")).toBeInTheDocument();
      // One spread price, the home one: no pair, so no prices
      expect(screen.getByText("+6.5")).toBeInTheDocument();
      expect(screen.getByText("-6.5")).toBeInTheDocument();
    } finally {
      failing.clear();
    }
  });
});

describe("Today's Board (MLB)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-24T16:00:00Z"));
    for (const k of Object.keys(db)) delete db[k];
    tablesRead.length = 0;
    Object.assign(db, {
      mlb_games: [game("m1", "2026-09-24T23:05:00Z", "New York Yankees", "Baltimore Orioles")],
      mlb_odds: [
        {
          game_id: "m1",
          sportsbook: "draftkings",
          spread_value: 1.5,
          spread_odds: -155,
          moneyline_home: 120,
          moneyline_away: -142,
          total_value: 8.5,
          total_over_odds: -110,
          total_under_odds: -110,
          updated_at: "2026-09-24T15:00:00Z",
        },
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads no stored lines and never prints the home run-line price on the away side", async () => {
    renderWithQuery(<TodaysBoard sport="MLB" />);
    expect(await screen.findByText("-142")).toBeInTheDocument();
    expect(screen.getByText("-1.5")).toBeInTheDocument();
    expect(screen.getByText("+1.5")).toBeInTheDocument();
    expect(screen.queryByText(/-155/)).toBeNull();
    expect(tablesRead).not.toContain("betting_lines");
  });
});

describe("NFL slate cards", () => {
  beforeEach(() => {
    for (const k of Object.keys(db)) delete db[k];
    Object.assign(db, {
      games: [
        game(1392251, "2026-09-27T17:00:00Z", "New York Jets", "Detroit Lions"),
        game(1392253, "2026-09-27T17:00:00Z", "Kansas City Chiefs", "Miami Dolphins"),
      ],
      odds: [nyjDetOdds],
      betting_lines: [
        ...nyjDetLines,
        // No odds row yet for this game: the stored line alone
        line("NFL", "1392253", "spread", "away", -10.5, -115, null, null),
        line("NFL", "1392253", "spread", "home", 10.5, -105, null, null),
      ],
    });
  });

  it("shows the stored DraftKings number on the card and in View All Odds", async () => {
    renderWithQuery(<NFLSlate />);
    expect(await screen.findByText("+245")).toBeInTheDocument();
    expect(screen.getByText("-305")).toBeInTheDocument();
    expect(screen.queryByText("+240")).toBeNull();
    expect(screen.queryByText("-298")).toBeNull();
    // Kansas City @ Miami has only a stored line, and still gets its DraftKings block
    expect(screen.getAllByText("DraftKings Odds")).toHaveLength(2);
    expect(screen.getByText("(-105)")).toBeInTheDocument();
    expect(screen.queryByText("Odds not available yet")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /View All Odds/i })[0]);
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("-305")).toBeInTheDocument();
    expect(within(sheet).getByText("+245")).toBeInTheDocument();
    expect(within(sheet).queryByText("-298")).toBeNull();
  });
});
