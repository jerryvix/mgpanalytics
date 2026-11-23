import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  matchEventsToGames,
  normalizeTeamName,
  ourGamesInRange,
  schoolCandidates,
  teamMatchScore,
  triageUnmatched,
  type GameRow,
} from "../../supabase/functions/sync-betting-splits/match";
import {
  kickoffToUtc,
  parseDkSplitsPage,
  parseKickoffLabel,
  type DkSplitsEvent,
} from "../../supabase/functions/sync-betting-splits/parse";
import { buildSplitRows, splitChanged, type OpeningLines } from "../../supabase/functions/sync-betting-splits/rows";

// Every Week 4 2026 matchup on the DK splits pages plus our ncaaf_games rows
// for the same days (ESPN display names; T04:00Z rows are TBD placeholders).
const week4 = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures", "dk-splits-ncaaf-2026-week4-matchups.json"), "utf-8"),
) as {
  capturedAt: string;
  dkEvents: Array<{ eventId: string; away: string; home: string; kickoffLabel: string }>;
  games: GameRow[];
};
const capturedAt = new Date(week4.capturedAt);
const dkEvents = week4.dkEvents.map((e) => ({ ...e, kickoffUtc: kickoffToUtc(parseKickoffLabel(e.kickoffLabel), capturedAt) }));

const game = (id: string, date: string, visitor: string, home: string): GameRow => ({
  id,
  date,
  visitor_team_name: visitor,
  home_team_name: home,
});
const event = (eventId: string, away: string, home: string, iso: string) => ({ eventId, away, home, kickoffUtc: new Date(iso) });

describe("team name normalization", () => {
  it("drops accents, apostrophes and punctuation", () => {
    expect(normalizeTeamName("San José State")).toBe("san jose state");
    expect(normalizeTeamName("Hawai'i Rainbow Warriors")).toBe("hawaii rainbow warriors");
    expect(normalizeTeamName("Texas A&M")).toBe("texas a and m");
    expect(normalizeTeamName("Miami (OH) RedHawks")).toBe("miami oh redhawks");
  });

  it("strips one- and two-word mascots without eating school qualifiers", () => {
    expect(schoolCandidates("Georgia State Panthers")).toEqual(["georgia state"]);
    expect(schoolCandidates("Miami (OH) RedHawks")).toEqual(["miami oh"]);
    expect(schoolCandidates("Hawai'i Rainbow Warriors")).toEqual(["hawaii rainbow", "hawaii"]);
    expect(schoolCandidates("Texas Tech Red Raiders")).toEqual(["texas tech red", "texas tech"]);
  });
});

describe("teamMatchScore", () => {
  it("matches DK's short school names exactly", () => {
    const exact: Array<[string, string]> = [
      ["Miami FL", "Miami Hurricanes"],
      ["Miami (FL)", "Miami Hurricanes"],
      ["Miami OH", "Miami (OH) RedHawks"],
      ["Ole Miss", "Ole Miss Rebels"],
      ["UConn", "UConn Huskies"],
      ["UTSA", "UTSA Roadrunners"],
      ["Southern Miss", "Southern Miss Golden Eagles"],
      ["App State", "App State Mountaineers"],
      ["Appalachian State", "App State Mountaineers"],
      ["UL Monroe", "UL Monroe Warhawks"],
      ["Louisiana-Monroe", "UL Monroe Warhawks"],
      ["San José State", "San José State Spartans"],
      ["San Jose State", "San José State Spartans"],
      ["Hawaii", "Hawai'i Rainbow Warriors"],
      ["Hawai'i", "Hawai'i Rainbow Warriors"],
      ["UMass", "Massachusetts Minutemen"],
      ["Texas A&M", "Texas A&M Aggies"],
      ["Louisiana", "Louisiana Ragin' Cajuns"],
      ["Sam Houston", "Sam Houston Bearkats"],
    ];
    for (const [dk, ours] of exact) expect(teamMatchScore("NCAAF", dk, ours), `${dk} vs ${ours}`).toBe(2);
  });

  it("never scores a different school as exact", () => {
    expect(teamMatchScore("NCAAF", "Miami FL", "Miami (OH) RedHawks")).toBe(1); // prefix only
    expect(teamMatchScore("NCAAF", "Georgia", "Georgia State Panthers")).toBe(1);
    expect(teamMatchScore("NCAAF", "Texas", "Texas A&M Aggies")).toBe(1);
    expect(teamMatchScore("NCAAF", "Miami OH", "Miami Hurricanes")).toBe(0);
    expect(teamMatchScore("NCAAF", "Louisiana Tech", "Louisiana Ragin' Cajuns")).toBe(0);
  });

  it("matches NFL teams on the nickname", () => {
    expect(teamMatchScore("NFL", "LA Chargers", "Los Angeles Chargers")).toBe(2);
    expect(teamMatchScore("NFL", "SF 49ers", "San Francisco 49ers")).toBe(2);
    expect(teamMatchScore("NFL", "LA Rams", "Los Angeles Chargers")).toBe(0);
    expect(teamMatchScore("NFL", "NY Jets", "New York Giants")).toBe(0);
  });

  it("matches NBA teams on the nickname, two-word ones included", () => {
    const exact: Array<[string, string]> = [
      ["POR Trail Blazers", "Portland Trail Blazers"],
      ["PHI 76ers", "Philadelphia 76ers"],
      ["PHO Suns", "Phoenix Suns"],
      ["LA Clippers", "LA Clippers"],
      ["LA Lakers", "Los Angeles Lakers"],
      ["UTA Jazz", "Utah Jazz"],
      ["NO Pelicans", "New Orleans Pelicans"],
      ["MIN Timberwolves", "Minnesota Timberwolves"],
    ];
    for (const [dk, ours] of exact) expect(teamMatchScore("NBA", dk, ours), `${dk} vs ${ours}`).toBe(2);
    expect(teamMatchScore("NBA", "LA Clippers", "Los Angeles Lakers")).toBe(0);
    expect(teamMatchScore("NBA", "POR Trail Blazers", "Golden State Warriors")).toBe(0);
  });

  it("reads DK's college basketball labels that only the NCAAB map covers", () => {
    const exact: Array<[string, string]> = [
      ["Saint Bonaventure", "St. Bonaventure Bonnies"],
      ["St. Johns", "St. John's Red Storm"],
      ["MD Eastern Shore", "Maryland Eastern Shore Hawks"],
      ["A&M-Corpus Christi", "Texas A&M-Corpus Christi Islanders"],
      // The football map still applies
      ["FIU", "Florida International Panthers"],
      ["Appalachian State", "App State Mountaineers"],
      ["Miami FL", "Miami Hurricanes"],
      ["Long Beach State", "Long Beach State Beach"],
    ];
    for (const [dk, ours] of exact) expect(teamMatchScore("NCAAB", dk, ours), `${dk} vs ${ours}`).toBe(2);
    // NCAAB aliases do not leak into football
    expect(teamMatchScore("NCAAF", "Saint Bonaventure", "St. Bonaventure Bonnies")).toBe(0);
    expect(teamMatchScore("NCAAB", "Texas", "Texas A&M-Corpus Christi Islanders")).toBe(1); // prefix only
  });
});

describe("matchEventsToGames", () => {
  it("maps every Week 4 DK matchup to its game with no misses", () => {
    const { matched, unmatched } = matchEventsToGames("NCAAF", dkEvents, week4.games);
    expect(unmatched).toEqual([]);
    expect(matched).toHaveLength(50);
    expect(matched.every((m) => m.score === 4 && !m.swapped)).toBe(true);
    const pair = (away: string) => {
      const m = matched.find((x) => x.event.away === away)!;
      return `${m.game.visitor_team_name} @ ${m.game.home_team_name}`;
    };
    expect(pair("Central Michigan")).toBe("Central Michigan Chippewas @ Miami Hurricanes"); // DK "Miami FL"
    expect(pair("UConn")).toBe("UConn Huskies @ Miami (OH) RedHawks"); // DK "Miami OH"
    expect(pair("Hawaii")).toBe("Hawai'i Rainbow Warriors @ Wyoming Cowboys");
    expect(pair("UMass")).toBe("Massachusetts Minutemen @ Sacramento State Hornets");
    expect(pair("Appalachian State")).toBe("App State Mountaineers @ NC State Wolfpack");
    expect(pair("Texas A&M")).toBe("Texas A&M Aggies @ LSU Tigers");
    // 11:00 PM Eastern vs our midnight-Eastern TBD placeholder, 23h apart
    expect(pair("Minnesota")).toBe("Minnesota Golden Gophers @ Washington Huskies");
  });

  it("flips orientation for a neutral-site game DK lists the other way", () => {
    const { matched } = matchEventsToGames(
      "NCAAF",
      [event("1", "Florida", "Georgia", "2026-10-31T19:30:00Z")],
      [game("g1", "2026-10-31T19:30:00Z", "Georgia Bulldogs", "Florida Gators")],
    );
    expect(matched).toHaveLength(1);
    expect(matched[0].swapped).toBe(true);
  });

  it("refuses games outside the kickoff window, ambiguous fits and double claims", () => {
    const far = matchEventsToGames(
      "NCAAF",
      [event("1", "Iowa", "Michigan", "2026-09-26T19:30:00Z")],
      [game("g1", "2026-10-10T19:30:00Z", "Iowa Hawkeyes", "Michigan Wolverines")],
    );
    expect(far.matched).toEqual([]);
    expect(far.unmatched[0].reason).toMatch(/no game row/);

    const twins = matchEventsToGames(
      "NCAAF",
      [event("1", "Iowa", "Michigan", "2026-09-26T19:30:00Z")],
      [
        game("g1", "2026-09-26T19:30:00Z", "Iowa Hawkeyes", "Michigan Wolverines"),
        game("g2", "2026-09-26T23:30:00Z", "Iowa Hawkeyes", "Michigan Wolverines"),
      ],
    );
    expect(twins.matched).toEqual([]);
    expect(twins.unmatched[0].reason).toMatch(/ambiguous/);

    const doubled = matchEventsToGames(
      "NCAAF",
      [event("1", "Iowa", "Michigan", "2026-09-26T19:30:00Z"), event("2", "Iowa", "Michigan", "2026-09-26T20:00:00Z")],
      [game("g1", "2026-09-26T19:30:00Z", "Iowa Hawkeyes", "Michigan Wolverines")],
    );
    expect(doubled.matched).toEqual([]);
    expect(doubled.unmatched.map((u) => u.reason)).toEqual([
      "game g1 claimed by 2 DK events",
      "game g1 claimed by 2 DK events",
    ]);
  });
});

describe("buildSplitRows", () => {
  const dkEvent: DkSplitsEvent & { kickoffUtc: Date } = {
    eventId: "34674727",
    away: "Liberty",
    home: "Coastal Carolina",
    kickoffLabel: "9/24, 07:30PM",
    kickoff: { month: 9, day: 24, hour: 19, minute: 30 },
    kickoffUtc: new Date("2026-09-24T23:30:00Z"),
    markets: {
      moneyline: [
        { side: "away", label: "Liberty", line: null, price: -135, handlePct: 88, betsPct: 58 },
        { side: "home", label: "Coastal Carolina", line: null, price: 114, handlePct: 12, betsPct: 42 },
      ],
      spread: [
        { side: "away", label: "Liberty -2.5", line: -2.5, price: -112, handlePct: 90, betsPct: 79 },
        { side: "home", label: "Coastal Carolina +2.5", line: 2.5, price: -108, handlePct: 10, betsPct: 21 },
      ],
      total: [
        { side: "over", label: "Over 50.5", line: 50.5, price: -105, handlePct: 55, betsPct: 50 },
        { side: "under", label: "Under 50.5", line: 50.5, price: -115, handlePct: 45, betsPct: 50 },
      ],
    },
  };
  // ESPN's DraftKings opening numbers for this game (captured the same night)
  const opens: OpeningLines = {
    openSpreadHome: -1.5,
    openSpreadHomeOdds: -110,
    openSpreadAwayOdds: -110,
    openMoneylineHome: -120,
    openMoneylineAway: 100,
    openTotal: 54.5,
    openTotalOverOdds: -110,
    openTotalUnderOdds: -110,
  };
  const ours = { id: "uuid-1", visitor_team_name: "Liberty Flames", home_team_name: "Coastal Carolina Chanticleers" };

  it("writes one row per side with DraftKings' open attached to the right side", () => {
    const rows = buildSplitRows("NCAAF", dkEvent, { game: ours, swapped: false }, opens, "2026-09-24T06:00:00Z");
    expect(rows).toHaveLength(6);
    const get = (market: string, side: string) => rows.find((r) => r.market === market && r.side === side)!;
    expect(get("spread", "away")).toMatchObject({ line: -2.5, price: -112, bets_pct: 79, handle_pct: 90, open_line: 1.5, open_price: -110 });
    expect(get("spread", "home")).toMatchObject({ line: 2.5, open_line: -1.5 });
    expect(get("moneyline", "away")).toMatchObject({ line: null, price: -135, open_line: null, open_price: 100 });
    expect(get("total", "under")).toMatchObject({ line: 50.5, price: -115, open_line: 54.5, open_price: -110 });
    expect(get("total", "over")).toMatchObject({
      game_id: "uuid-1",
      source: "draftkings",
      source_event_id: "34674727",
      source_matchup: "Liberty @ Coastal Carolina",
      away_team: "Liberty Flames",
      home_team: "Coastal Carolina Chanticleers",
      event_start: "2026-09-24T23:30:00.000Z",
    });
  });

  it("flips team sides for a swapped listing so numbers stay with the team", () => {
    const flippedGame = { ...ours, visitor_team_name: ours.home_team_name, home_team_name: ours.visitor_team_name };
    const rows = buildSplitRows("NCAAF", dkEvent, { game: flippedGame, swapped: true }, null, "2026-09-24T06:00:00Z");
    // Liberty is OUR home team here, and keeps Liberty's -2.5 and 79% of bets
    expect(rows.find((r) => r.market === "spread" && r.side === "home")).toMatchObject({ line: -2.5, bets_pct: 79 });
    expect(rows.find((r) => r.market === "total" && r.side === "over")).toMatchObject({ line: 50.5, bets_pct: 50 });
  });
});

describe("splitChanged", () => {
  const next = { line: -2.5, price: -112, bets_pct: 79, handle_pct: 90 } as Parameters<typeof splitChanged>[1];
  it("treats PostgREST's numeric strings as numbers and flags real moves only", () => {
    expect(splitChanged(undefined, next)).toBe(true);
    expect(splitChanged({ line: "-2.5", price: -112, bets_pct: 79, handle_pct: 90 }, next)).toBe(false);
    expect(splitChanged({ line: -2.5, price: -112, bets_pct: 78, handle_pct: 90 }, next)).toBe(true);
    expect(splitChanged({ line: -3, price: -112, bets_pct: 79, handle_pct: 90 }, next)).toBe(true);
  });
});


// Nov 23 2026: DK's NBA and college basketball splits pages (the parsed
// fixtures from the parser fix, plus every NCAAB matchup on that day's n7days
// pages) against our games as ESPN names them that day. Built from the DK
// pages and ESPN's scoreboards (dates=20261123 for the NBA; Division I,
// 20261123 and 20261124, for NCAAB).
const basketball = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures", "dk-splits-basketball-2026-11-23-matchups.json"), "utf-8"),
) as {
  capturedAt: string;
  nba: { dkEvents: Array<{ eventId: string; away: string; home: string; kickoffLabel: string }>; games: GameRow[] };
  ncaab: {
    dkEvents: Array<{ eventId: string; away: string; home: string; kickoffLabel: string }>;
    games: Array<GameRow & { home_team_rank: number | null; visitor_team_rank: number | null }>;
  };
};
const bbNow = new Date(basketball.capturedAt);
const withKickoff = <T extends { kickoffLabel: string }>(events: T[]) =>
  events.map((e) => ({ ...e, kickoffUtc: kickoffToUtc(parseKickoffLabel(e.kickoffLabel), bbNow) }));
const fixturePage = (name: string) =>
  withKickoff(parseDkSplitsPage(readFileSync(resolve(__dirname, "fixtures", name), "utf-8")).events);
const pairOf = (m: { game: GameRow }) => `${m.game.visitor_team_name} @ ${m.game.home_team_name}`;

describe("basketball matching (Nov 23 2026)", () => {
  it("maps every NBA matchup on DK's page to its game", () => {
    const events = fixturePage("dk-splits-nba-2026-11-23-p1.html");
    const { matched, unmatched } = matchEventsToGames("NBA", events, basketball.nba.games);
    expect(unmatched).toEqual([]);
    expect(matched).toHaveLength(10);
    expect(matched.every((m) => m.score === 4 && !m.swapped)).toBe(true);
    const by = (away: string) => pairOf(matched.find((m) => m.event.away === away)!);
    expect(by("POR Trail Blazers")).toBe("Portland Trail Blazers @ Philadelphia 76ers");
    expect(by("PHO Suns")).toBe("Phoenix Suns @ New Orleans Pelicans");
    expect(by("LA Clippers")).toBe("LA Clippers @ Houston Rockets");
    expect(by("UTA Jazz")).toBe("Utah Jazz @ Los Angeles Lakers");
    expect(by("SA Spurs")).toBe("San Antonio Spurs @ Sacramento Kings");
  });

  it("maps every NCAAB matchup on DK's first page to its game", () => {
    const events = fixturePage("dk-splits-ncaab-2026-11-23-p1.html");
    const { matched, unmatched } = matchEventsToGames("NCAAB", events, basketball.ncaab.games);
    expect(unmatched).toEqual([]);
    expect(matched).toHaveLength(10);
    const by = (away: string) => pairOf(matched.find((m) => m.event.away === away)!);
    expect(by("Saint Bonaventure")).toBe("St. Bonaventure Bonnies @ App State Mountaineers");
    expect(by("Long Beach State")).toBe("Long Beach State Beach @ Florida International Panthers"); // DK "FIU"
    expect(by("Northern Iowa")).toBe("Northern Iowa Panthers @ Davidson Wildcats");
    expect(by("Tulsa")).toBe("Tulsa Golden Hurricane @ Oregon State Beavers");
  });

  it("maps all 39 NCAAB matchups DK listed for the week, a neutral-site flip included", () => {
    const events = withKickoff(basketball.ncaab.dkEvents);
    const { matched, unmatched } = matchEventsToGames("NCAAB", events, basketball.ncaab.games);
    expect(unmatched).toEqual([]);
    expect(matched).toHaveLength(39);
    const by = (away: string) => matched.find((m) => m.event.away === away)!;
    expect(pairOf(by("MD Eastern Shore"))).toBe("Maryland Eastern Shore Hawks @ Youngstown State Penguins");
    expect(pairOf(by("A&M-Corpus Christi"))).toBe("Texas A&M-Corpus Christi Islanders @ Wichita State Shockers");
    expect(pairOf(by("Oregon"))).toBe("Oregon Ducks @ St. John's Red Storm");
    expect(pairOf(by("Miami FL"))).toBe("Miami Hurricanes @ TCU Horned Frogs");
    // DK lists this neutral-site game the other way round from ESPN
    expect(by("Utah Valley")).toMatchObject({ swapped: true, score: 4 });
    expect(pairOf(by("Utah Valley"))).toBe("Stephen F. Austin Lumberjacks @ Utah Valley Wolverines");
  });

  it("keeps an NBA event off the same teams' game the next night", () => {
    const tonight = [event("1", "PHO Suns", "NO Pelicans", "2026-11-24T01:10:00Z")];
    const rows = [
      game("g-mon", "2026-11-24T01:00:00Z", "Phoenix Suns", "New Orleans Pelicans"),
      game("g-tue", "2026-11-25T01:00:00Z", "Phoenix Suns", "New Orleans Pelicans"),
    ];
    const both = matchEventsToGames("NBA", tonight, rows);
    expect(both.matched.map((m) => m.game.id)).toEqual(["g-mon"]);
    // Tonight's row not stored: tomorrow's is no stand-in
    const onlyTue = matchEventsToGames("NBA", tonight, [rows[1]]);
    expect(onlyTue.matched).toEqual([]);
    expect(onlyTue.unmatched[0]).toMatchObject({ reason: "no game row with either team within 12h", neitherTeamSeen: true });
  });
});

describe("triageUnmatched", () => {
  // What ncaab_games holds when DK's page is read: ranked games in the next 24 hours
  const ranked = basketball.ncaab.games.filter(
    (g) =>
      (g.home_team_rank !== null || g.visitor_team_rank !== null) &&
      Date.parse(g.date) > bbNow.getTime() &&
      Date.parse(g.date) <= bbNow.getTime() + 24 * 3600_000,
  );
  const events = withKickoff(basketball.ncaab.dkEvents);

  it("counts DK games our ranked-only table does not store apart from misses", () => {
    expect(ranked.map((g) => pairOf({ game: g }))).toEqual([
      "Washington Huskies @ BYU Cougars",
      "Winthrop Eagles @ Illinois Fighting Illini",
      "Denver Pioneers @ Kansas Jayhawks",
      "Colorado State Rams @ Arizona Wildcats",
    ]);
    const { matched, unmatched } = matchEventsToGames("NCAAB", events, ranked);
    expect(matched).toHaveLength(4);
    const t = triageUnmatched("subset", unmatched, { matched: matched.length, ourGamesInRange: ourGamesInRange(ranked, events, bbNow) });
    expect(t.misses).toEqual([]);
    expect(t.notInOurGames).toHaveLength(35);
    expect(t.notInOurGames.every((u) => u.reason === "no game row with either team within 12h")).toBe(true);
    // Tomorrow's ranked games, past the table's 24 hours, are "not stored" too
    expect(t.notInOurGames.map((u) => u.event.away)).toEqual(expect.arrayContaining(["Tennessee", "Oregon", "Texas Tech"]));
    // Football's table holds every game: the same leftovers would all be misses
    expect(triageUnmatched("all", unmatched, { matched: matched.length, ourGamesInRange: 4 }).misses).toHaveLength(35);
  });

  it("keeps a name that fails on a stored game as a miss", () => {
    const renamed = events.map((e) => (e.home === "BYU" ? { ...e, home: "Brigham Young U" } : e));
    const { matched, unmatched } = matchEventsToGames("NCAAB", renamed, ranked);
    const t = triageUnmatched("subset", unmatched, { matched: matched.length, ourGamesInRange: ourGamesInRange(ranked, renamed, bbNow) });
    expect(t.misses).toHaveLength(1);
    expect(t.misses[0].reason).toBe("no game row with both teams within 12h; no row has Brigham Young U");
  });

  it("treats every leftover as a miss when nothing matched games we hold", () => {
    // DK starts printing records after the names: no name is seen anywhere, yet our table has games in DK's range
    const relabeled = events.map((e) => ({ ...e, away: `${e.away} (5-1)`, home: `${e.home} (6-0)` }));
    const { matched, unmatched } = matchEventsToGames("NCAAB", relabeled, ranked);
    expect(matched).toEqual([]);
    expect(unmatched.every((u) => u.neitherTeamSeen)).toBe(true);
    const inRange = ourGamesInRange(ranked, relabeled, bbNow);
    expect(inRange).toBe(4);
    const t = triageUnmatched("subset", unmatched, { matched: 0, ourGamesInRange: inRange });
    expect(t.misses).toHaveLength(39);
    expect(t.notInOurGames).toEqual([]);
  });
});

