import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  matchEventsToGames,
  normalizeTeamName,
  schoolCandidates,
  teamMatchScore,
  type GameRow,
} from "../../supabase/functions/sync-betting-splits/match";
import { kickoffToUtc, parseKickoffLabel, type DkSplitsEvent } from "../../supabase/functions/sync-betting-splits/parse";
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
