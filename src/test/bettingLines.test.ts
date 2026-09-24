import { describe, it, expect } from "vitest";
import {
  eventsInWindow,
  linesFromQuotes,
  parseEspnScoreboard,
  resolveEspnEvents,
  upcomingGames,
  type LinesGame,
} from "../../supabase/functions/sync-betting-splits/lines";
import { buildLineRows, orientQuote, type DkEventQuote } from "../../supabase/functions/sync-betting-splits/rows";
import { teamMatchScore } from "../../supabase/functions/sync-betting-splits/match";
import { consensusPriceMove, latestSnapshots } from "@/lib/odds";

// ESPN's DraftKings quote for NYJ @ DET, Sep 24 2026 (home-relative)
const nyjDet: DkEventQuote = {
  spreadHome: -6.5,
  spreadHomeOdds: -115,
  spreadAwayOdds: -105,
  moneylineHome: -305,
  moneylineAway: 245,
  totalValue: 47.5,
  totalOverOdds: -108,
  totalUnderOdds: -112,
  openSpreadHome: -9.5,
  openSpreadHomeOdds: -110,
  openSpreadAwayOdds: -110,
  openMoneylineHome: -440,
  openMoneylineAway: 340,
  openTotal: 44.5,
  openTotalOverOdds: -110,
  openTotalUnderOdds: -110,
};

describe("buildLineRows", () => {
  it("writes current and DraftKings' open for every side, with BOTH spread prices", () => {
    const rows = buildLineRows("NFL", "1392251", "401772799", nyjDet, "2026-09-24T09:00:00Z");
    const get = (m: string, s: string) => rows.find((r) => r.market === m && r.side === s)!;
    expect(rows).toHaveLength(6);
    expect(get("spread", "away")).toMatchObject({ line: 6.5, price: -105, open_line: 9.5, open_price: -110 });
    expect(get("spread", "home")).toMatchObject({ line: -6.5, price: -115, open_line: -9.5, open_price: -110 });
    expect(get("moneyline", "away")).toMatchObject({ line: null, price: 245, open_price: 340 });
    expect(get("moneyline", "home")).toMatchObject({ line: null, price: -305, open_price: -440 });
    expect(get("total", "under")).toMatchObject({ line: 47.5, price: -112, open_line: 44.5, open_price: -110 });
    expect(get("total", "over")).toMatchObject({
      sport: "NFL",
      game_id: "1392251",
      source: "draftkings",
      feed: "espn",
      feed_event_id: "401772799",
      captured_at: "2026-09-24T09:00:00Z",
    });
  });

  it("skips markets DraftKings has not posted (no moneyline on a 41.5-point spread)", () => {
    const rows = buildLineRows("NCAAF", "g", "e", { ...nyjDet, moneylineHome: null, moneylineAway: null }, "t");
    expect(rows.map((r) => r.market)).not.toContain("moneyline");
    expect(rows).toHaveLength(4);
  });
});

describe("orientQuote", () => {
  it("flips a neutral-site quote so every number stays with its team", () => {
    const flipped = orientQuote(nyjDet, true);
    expect(flipped).toMatchObject({
      spreadHome: 6.5,
      spreadHomeOdds: -105,
      spreadAwayOdds: -115,
      moneylineHome: 245,
      moneylineAway: -305,
      openSpreadHome: 9.5,
      openMoneylineHome: 340,
      totalValue: 47.5,
    });
    expect(orientQuote(nyjDet, false)).toBe(nyjDet);
  });
});

describe("resolving ESPN events", () => {
  const games: LinesGame[] = [
    { id: "g1", external_id: "espn_ncaaf_401869941", date: "2026-09-24T23:30:00Z", home_team_name: "Coastal Carolina Chanticleers", visitor_team_name: "Liberty Flames" },
    { id: "g2", external_id: "cfbd_123", date: "2026-09-26T16:00:00Z", home_team_name: "A", visitor_team_name: "B" },
  ];

  it("reads NCAAF event ids straight from external_id", () => {
    const { byGame } = resolveEspnEvents("NCAAF", games, { idPrefix: "espn_ncaaf_" });
    expect([...byGame.entries()]).toEqual([["g1", { eventId: "401869941", swapped: false }]]);
  });

  it("pairs BDL-keyed NFL games with ESPN's scoreboard on both teams and kickoff", () => {
    const events = parseEspnScoreboard({
      events: [
        {
          id: "401772799",
          date: "2026-09-27T17:00Z",
          status: { type: { completed: false } },
          competitions: [
            {
              competitors: [
                { homeAway: "home", team: { displayName: "Detroit Lions" } },
                { homeAway: "away", team: { displayName: "New York Jets" } },
              ],
            },
          ],
        },
        { id: "1", date: "2026-09-20T17:00Z", status: { type: { completed: true } }, competitions: [] },
      ],
    });
    expect(events).toEqual([
      { eventId: "401772799", away: "New York Jets", home: "Detroit Lions", kickoffUtc: new Date("2026-09-27T17:00Z") },
    ]);
    const nfl: LinesGame[] = [
      { id: 1392251, external_id: "nfl_1392251", date: "2026-09-27T17:00:00Z", home_team_name: "Detroit Lions", visitor_team_name: "New York Jets" },
    ];
    const { byGame, unmatchedEvents } = resolveEspnEvents("NFL", nfl, { events });
    expect(byGame.get("1392251")).toEqual({ eventId: "401772799", swapped: false });
    expect(unmatchedEvents).toEqual([]);
  });

  it("drops the next week's scoreboard events instead of reporting them unmatched", () => {
    // Sep 24 2026 09:31 run: the week-scoped CDN mirror returned Week 5 with the window's last dates
    const now = new Date("2026-09-24T09:31:03Z");
    const until = new Date(now.getTime() + 8 * 24 * 3600_000); // the games window's end
    const ev = (eventId: string, away: string, home: string, kickoff: string) => ({ eventId, away, home, kickoffUtc: new Date(kickoff) });
    const events = [
      ev("401772799", "New York Jets", "Detroit Lions", "2026-09-27T17:00Z"),
      ev("401772800", "Dallas Cowboys", "Philadelphia Eagles", "2026-10-01T00:15Z"), // Week 5 Thursday: in the window
      ev("401772801", "Chicago Bears", "Green Bay Packers", "2026-10-04T17:00Z"), // Week 5 Sunday: past it
      ev("401772790", "Buffalo Bills", "Miami Dolphins", "2026-09-24T09:00Z"), // already kicked off
    ];
    expect(eventsInWindow(events, now, until).map((e) => e.eventId)).toEqual(["401772799", "401772800"]);
    const nfl: LinesGame[] = [
      { id: 1392251, external_id: null, date: "2026-09-27T17:00:00Z", home_team_name: "Detroit Lions", visitor_team_name: "New York Jets" },
      { id: 1392264, external_id: null, date: "2026-10-01T00:15:00Z", home_team_name: "Philadelphia Eagles", visitor_team_name: "Dallas Cowboys" },
    ];
    const { byGame, unmatchedEvents } = resolveEspnEvents("NFL", nfl, { events: eventsInWindow(events, now, until) });
    expect(byGame.size).toBe(2);
    expect(unmatchedEvents).toEqual([]);
  });
});

describe("linesFromQuotes", () => {
  it("keeps DraftKings quotes only and returns them in our orientation", () => {
    const byGame = new Map([
      ["g1", { eventId: "e1", swapped: false }],
      ["g2", { eventId: "e2", swapped: true }],
      ["g3", { eventId: "e3", swapped: false }],
    ]);
    const quotes = new Map([
      ["e1", { ...nyjDet, sportsbook: "draftkings" }],
      ["e2", { ...nyjDet, sportsbook: "draftkings" }],
      ["e3", { ...nyjDet, sportsbook: "espnbet" }], // ESPN's fallback provider is not DraftKings
    ]);
    const { rows, quotesByGame } = linesFromQuotes("NFL", byGame, quotes, "t");
    expect([...quotesByGame.keys()]).toEqual(["g1", "g2"]);
    expect(quotesByGame.get("g2")!.moneylineHome).toBe(245);
    expect(rows.filter((r) => r.game_id === "g2" && r.market === "moneyline" && r.side === "home")[0].price).toBe(245);
    expect(rows.some((r) => r.game_id === "g3")).toBe(false);
  });
});

describe("upcomingGames", () => {
  const now = new Date("2026-09-26T05:00:00Z"); // 1 AM Eastern, Saturday
  it("drops games under way but keeps a TBD kickoff through its day", () => {
    const games = [
      { id: "started", external_id: null, date: "2026-09-26T04:30:00Z", home_team_name: "A", visitor_team_name: "B" },
      { id: "tbd", external_id: null, date: "2026-09-26T04:00:00Z", time_tbd: true, home_team_name: "C", visitor_team_name: "D" },
      { id: "later", external_id: null, date: "2026-09-26T16:00:00Z", home_team_name: "E", visitor_team_name: "F" },
    ];
    expect(upcomingGames(games, now).map((g) => g.id)).toEqual(["tbd", "later"]);
  });
});

describe("DK short names (FCS and FBS abbreviations)", () => {
  it("resolves the abbreviations DK prints for schools ESPN spells out", () => {
    const pairs: Array<[string, string]> = [
      ["LIU", "Long Island University Sharks"],
      ["Long Island", "Long Island University Sharks"],
      ["UIW", "Incarnate Word Cardinals"],
      ["ETSU", "East Tennessee State Buccaneers"],
      ["UTRGV", "UT Rio Grande Valley Vaqueros"],
      ["UAPB", "Arkansas-Pine Bluff Golden Lions"],
      ["NC A&T", "North Carolina A&T Aggies"],
      ["NC Central", "North Carolina Central Eagles"],
      ["SEMO", "Southeast Missouri State Redhawks"],
      ["UNI", "Northern Iowa Panthers"],
      ["Southeastern Louisiana", "SE Louisiana Lions"],
      ["Nicholls State", "Nicholls Colonels"],
      ["Citadel", "The Citadel Bulldogs"],
      ["Albany", "UAlbany Great Danes"],
      ["Houston Baptist", "Houston Christian Huskies"],
      ["Kent St.", "Kent State Golden Flashes"],
      ["Jax State", "Jacksonville State Gamecocks"],
      ["Cal", "California Golden Bears"],
    ];
    for (const [dk, ours] of pairs) expect(teamMatchScore("NCAAF", dk, ours), `${dk} vs ${ours}`).toBe(2);
  });

  it("does not guess the ambiguous ones", () => {
    expect(teamMatchScore("NCAAF", "SDSU", "San Diego State Aztecs")).toBe(0);
    expect(teamMatchScore("NCAAF", "SDSU", "South Dakota State Jackrabbits")).toBe(0);
    expect(teamMatchScore("NCAAF", "Cal", "Cal Poly Mustangs")).toBe(0);
  });
});

describe("latestSnapshots (odds_history)", () => {
  // NYJ @ DET, Sep 24 2026: two DraftKings captures an hour apart. Averaging
  // them showed "+340 → +242 · 2 books", a price nobody offered.
  const rows = [
    { game_id: "espn_nfl_401772799", bookmaker: "draftkings", odds_type: "moneyline", team: "New York Jets", opening_line: 340, current_line: 240, timestamp: "2026-09-24T06:12:33Z" },
    { game_id: "espn_nfl_401772799", bookmaker: "draftkings", odds_type: "moneyline", team: "New York Jets", opening_line: 340, current_line: 245, timestamp: "2026-09-24T07:12:20Z" },
  ];

  it("keeps one capture per game, book, bet type and side: the latest", () => {
    expect(latestSnapshots(rows)).toEqual([rows[1]]);
  });

  it("so consensus movement is a real price from a real count of books", () => {
    const move = consensusPriceMove(latestSnapshots(rows).map((r) => ({ open: r.opening_line, current: r.current_line })));
    expect(move).toMatchObject({ open: 340, current: 245, books: 1 });
  });
});
