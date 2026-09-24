import { describe, it, expect } from "vitest";
import * as app from "@/lib/marketPulse";
import * as detector from "@/utils/sharpMoneyDetector";
import * as shared from "../../supabase/functions/_shared/market-pulse";
import {
  findSplitsGame,
  gameIntent,
  groupSplitGames,
  isPulseQuestion,
  kickoffEt,
  lineOnlyGames,
  LIST_WORDS,
  listScope,
  marketPulseBlock,
  mayNameTeam,
  pickPulseGames,
  pulseBlock,
  pulseBrief,
  type SplitsGame,
  type StoredSplitRow,
} from "../../supabase/functions/_shared/pulse-chat";
import { leagueFor } from "../../supabase/functions/_shared/league-detect";
import { clearPlayerNames, indexPlayerNames } from "../../supabase/functions/_shared/player-names";
import { scanTeams, TEAMS } from "../../supabase/functions/_shared/team-names";

// The live chat (gemini-chat) now carries DraftKings' public splits for the
// NCAAF/NFL game a question is about, built with the SAME Market Pulse rules
// the app renders. Numbers below are the stored rows after the Sep 24 2026
// 11:52 UTC run.

const now = new Date("2026-09-24T12:12:00Z");
const SPLIT_AT = "2026-09-24T11:52:42+00:00";
const LINE_AT = "2026-09-24T11:52:41.008+00:00";

type Side = [market: string, side: string, bets: number, money: number];
const splitRows = (sport: string, gameId: string, matchup: string, away: string, home: string, start: string, sides: Side[]): StoredSplitRow[] =>
  sides.map(([market, side, bets, money]) => ({
    sport,
    game_id: gameId,
    source_matchup: matchup,
    away_team: away,
    home_team: home,
    event_start: start,
    market,
    side,
    bets_pct: bets,
    handle_pct: money,
    captured_at: "2026-09-24T11:52:41.008+00:00",
    source_as_of: SPLIT_AT,
  }));
const line = (market: string, side: string, value: number | null, price: number, openLine: number | null, openPrice: number | null) => ({
  market,
  side,
  line: value,
  price,
  open_line: openLine,
  open_price: openPrice,
  captured_at: LINE_AT,
});

const splitGames = groupSplitGames([
  ...splitRows("NCAAF", "ou-uga", "Oklahoma @ Georgia", "Oklahoma Sooners", "Georgia Bulldogs", "2026-09-26T19:30:00Z", [
    ["spread", "away", 32, 65],
    ["spread", "home", 68, 35],
    ["total", "over", 79, 12],
    ["total", "under", 21, 88],
    ["moneyline", "away", 3, 13],
    ["moneyline", "home", 97, 87],
  ]),
  ...splitRows("NCAAF", "army-tem", "Army @ Temple", "Army Black Knights", "Temple Owls", "2026-09-26T16:00:00Z", [
    ["total", "over", 63, 28],
    ["total", "under", 38, 72],
  ]),
  ...splitRows("NFL", "1392253", "KC Chiefs @ MIA Dolphins", "Kansas City Chiefs", "Miami Dolphins", "2026-09-27T17:00:00Z", [
    ["total", "over", 39, 4],
    ["total", "under", 61, 96],
  ]),
  ...splitRows("NFL", "1392250", "CAR Panthers @ CLE Browns", "Carolina Panthers", "Cleveland Browns", "2026-09-27T17:00:00Z", [
    ["spread", "away", 55, 52],
    ["spread", "home", 45, 48],
  ]),
]);
const lineOnly = lineOnlyGames("NCAAF", [
  { id: "az-wsu", date: "2026-09-26T23:30:00Z", status: "STATUS_SCHEDULED", home_team_name: "Washington State Cougars", visitor_team_name: "Arizona Wildcats", time_tbd: false },
  { id: "mia-clem", date: "2026-10-03T04:00:00Z", status: "STATUS_SCHEDULED", home_team_name: "Clemson Tigers", visitor_team_name: "Miami Hurricanes", time_tbd: true },
]);
const candidates: SplitsGame[] = [...splitGames, ...lineOnly];
const byId = (id: string) => candidates.find((g) => g.gameId === id)!;
const withLines = (id: string, lines: ReturnType<typeof line>[]): SplitsGame => ({ ...byId(id), lines });

const ouUga = withLines("ou-uga", [
  line("spread", "away", 14, -110, 10, -110),
  line("spread", "home", -14, -110, -10, -110),
  line("total", "over", 44.5, -110, 52.5, -110),
  line("total", "under", 44.5, -110, 52.5, -110),
  line("moneyline", "away", null, 440, null, 310),
  line("moneyline", "home", null, -600, null, -395),
]);
const armyTemple = withLines("army-tem", [line("total", "over", 47.5, -118, 49.5, -110), line("total", "under", 47.5, -102, 49.5, -110)]);
const kcMia = withLines("1392253", [line("total", "over", 46.5, -105, 44.5, -110), line("total", "under", 46.5, -115, 44.5, -110)]);
const azWsu = withLines("az-wsu", [
  line("spread", "away", -10, -115, -13.5, -110),
  line("spread", "home", 10, -105, 13.5, -110),
  line("total", "over", 48.5, -110, 48.5, -110),
  line("total", "under", 48.5, -110, 48.5, -110),
  line("moneyline", "away", null, -410, null, -575),
  line("moneyline", "home", null, 320, null, 425),
]);

describe("one copy of the Market Pulse rules", () => {
  it("the app, the sharp-money detector and the chat share the same functions", () => {
    expect(app.buildMarketView).toBe(shared.buildMarketView);
    expect(app.buildMarketPulse).toBe(shared.buildMarketPulse);
    expect(app.movedToward).toBe(shared.movedToward);
    expect(app.openToNow).toBe(shared.openToNow);
    expect(app.chooseLine).toBe(shared.chooseLine);
    expect(detector.isSharpSide).toBe(shared.isSharpSide);
    expect([app.SHARP_EDGE_PTS, app.PUBLIC_BETS_PCT, app.PRICE_MOVE_PTS, detector.SHARP_THRESHOLD]).toEqual([10, 60, 2, 10]);
  });
});

describe("isPulseQuestion", () => {
  it("catches public, sharp and splits questions and leaves the rest", () => {
    for (const q of [
      "What's public on for both sides of Army Temple?",
      "sharp money Arizona Washington State",
      "show me the splits for Chiefs Dolphins",
      "where's the money going this weekend",
      "what % of bets are on the Over in KC Miami",
      "any reverse line movement in college football?",
      "betting percentages for Oklahoma Georgia",
    ]) {
      expect(isPulseQuestion(q), q).toBe(true);
    }
    for (const q of ["Who won the Jets game last night?", "Josh Allen passing yards this season", "When does Georgia play?"]) {
      expect(isPulseQuestion(q), q).toBe(false);
    }
  });
});

describe("pickPulseGames", () => {
  it("covers the game a question names, split or not, whatever league the chat guessed", () => {
    expect(pickPulseGames("What's public on for both sides of Army Temple?", candidates, {}, now).map((g) => g.gameId)).toEqual(["army-tem"]);
    expect(pickPulseGames("sharp money Arizona Washington State", candidates, {}, now).map((g) => g.gameId)).toEqual(["az-wsu"]);
    expect(pickPulseGames("Chiefs Dolphins spread", candidates, {}, now).map((g) => g.gameId)).toEqual(["1392253"]);
  });

  it("lists the games with markers first for a splits question that names no game", () => {
    const all = pickPulseGames("where is the sharp money this weekend?", candidates, {}, now).map((g) => g.gameId);
    expect(all).toEqual(["ou-uga", "army-tem", "1392253", "1392250"]);
    expect(pickPulseGames("NFL public betting this week", candidates, { sport: "NFL" }, now).map((g) => g.gameId)).toEqual([
      "1392253",
      "1392250",
    ]);
    expect(pickPulseGames("where is the public?", candidates, { limit: 1 }, now)).toHaveLength(1);
  });

  it("adds nothing to a question that is neither about a game nor about splits", () => {
    expect(pickPulseGames("Who leads the NFL in rushing?", candidates, {}, now)).toEqual([]);
  });
});

describe("pulseBrief", () => {
  it("gives both sides' bets and money, the markers, the split's page time, and the app's line with Open → Now", () => {
    const text = pulseBrief(ouUga, now);
    expect(text).toContain("Oklahoma Sooners @ Georgia Bulldogs (NCAAF, Sat 3:30 PM ET) · DraftKings split updated 19m ago · line updated 19m ago");
    expect(text).toContain(
      "- Spread: Oklahoma Sooners +14 (-110): 32% of bets, 65% of money [sharp money] | Georgia Bulldogs -14 (-110): 68% of bets, 35% of money [public side] | Open +10 → Now +14 (Oklahoma Sooners)",
    );
    expect(text).toContain(
      "- Total 44.5: Over (-110): 79% of bets, 12% of money [public side] | Under (-110): 21% of bets, 88% of money [sharp money, reverse line move] | Open 52.5 → Now 44.5",
    );
    expect(text).toContain(
      "- Moneyline: Oklahoma Sooners +440: 3% of bets, 13% of money | Georgia Bulldogs -600: 97% of bets, 87% of money [public side] | Open +310 / -395 → Now +440 / -600 (away / home)",
    );
  });

  it("fires the markers Market Pulse fires: Army @ Temple and KC @ MIA after the 11:52 run", () => {
    expect(pulseBrief(armyTemple, now)).toContain(
      "- Total 47.5: Over (-118): 63% of bets, 28% of money [public side] | Under (-102): 38% of bets, 72% of money [sharp money, reverse line move] | Open 49.5 → Now 47.5",
    );
    expect(pulseBrief(kcMia, now)).toContain(
      "- Total 46.5: Over (-105): 39% of bets, 4% of money [reverse line move] | Under (-115): 61% of bets, 96% of money [public side] | Open 44.5 → Now 46.5",
    );
    const view = app.buildMarketView("total", { splits: kcMia.rows, lines: kcMia.lines, odds: null })!;
    expect(view.sides.map((s) => [s.sharp, s.publicSide, s.reverseMove])).toEqual([
      [false, false, true],
      [false, true, false],
    ]);
  });

  it("says plainly when DraftKings posted no split, and still gives the line", () => {
    const text = pulseBrief(azWsu, now);
    expect(text).toContain("Arizona Wildcats @ Washington State Cougars (NCAAF, Sat 7:30 PM ET) · no DraftKings public split posted for this game · line updated 19m ago");
    expect(text).toContain("- Spread: Arizona Wildcats -10 (-115) | Washington State Cougars +10 (-105) | Open -13.5 → Now -10 (Arizona Wildcats)");
    expect(text).toContain("- Total 48.5: Over (-110) | Under (-110) | Open 48.5, unchanged");
    expect(text).toContain("- Moneyline: Arizona Wildcats -410 | Washington State Cougars +320 | Open -575 / +425 → Now -410 / +320 (away / home)");
    expect(text).not.toContain("% of bets");
    // Nothing stored at all: said, not guessed
    expect(pulseBrief(byId("mia-clem"), now)).toBe(
      "Miami Hurricanes @ Clemson Tigers (NCAAF, Sat Oct 3, kickoff time TBD) · no DraftKings public split posted for this game · no DraftKings line stored yet",
    );
  });
});

describe("mayNameTeam", () => {
  it("is false only for questions made of everyday and betting words", () => {
    expect(mayNameTeam("What games are on tonight?")).toBe(false);
    expect(mayNameTeam("who's favored this weekend in college football")).toBe(false);
    for (const q of ["Army Temple odds", "Liberty spread", "Iron Bowl line", "Georgia vs Oklahoma spread", "Chiefs total"]) {
      expect(mayNameTeam(q), q).toBe(true);
    }
  });
});

describe("pulseBlock", () => {
  it("tells the model how to answer, defines the markers once, and stays small", () => {
    const block = pulseBlock([ouUga, armyTemple, azWsu], now);
    expect(block.startsWith("[DRAFTKINGS MARKET PULSE]\n")).toBe(true);
    // QC round 6: numbers the model must keep only for the games listed; round 8: "the upcoming games listed below", so a correct generic list is not skipped
    expect(block).toContain("If the user is asking about the betting on, or the outlook for, the upcoming games listed below, use these exact numbers and never alter them");
    // Round 7: futures in the ignore list, and the ignore rule outranks the prompt's "ALWAYS lead with data" directives
    expect(block).toContain("a player's past, futures or season-long markets), ignore this block.");
    expect(block).toContain("This ignore rule takes precedence over the general directives to ALWAYS lead with whatever data IS available and to use [MGP DATA] alongside search results.");
    expect(block).toContain("If the question is about something else (history, a different game, a player's past, futures");
    expect(block).not.toContain("Never replace these numbers");
    expect(block).toContain("give the bets % and money % for BOTH sides of each market asked about");
    expect(block).toContain("For a game with no DraftKings public split, say DraftKings hasn't posted one and give its line.");
    expect(block).toContain("Public side = 60%+ of bets.");
    expect(block.match(/Markers:/g)).toHaveLength(1);
    expect(block.length).toBeLessThan(3000); // about 700 tokens for three games
    expect(block.includes(String.fromCharCode(0x2014))).toBe(false); // house rule: no em dashes
    expect(pulseBlock([], now)).toBe("");
  });

  it("formats kickoffs in Eastern time, a TBD placeholder by its day", () => {
    expect(kickoffEt("2026-09-26T23:30:00Z")).toBe("Sat 7:30 PM ET");
    expect(kickoffEt("2026-10-03T04:00:00Z", true)).toBe("Sat Oct 3, kickoff time TBD");
    expect(kickoffEt(null)).toBeNull();
  });
});

describe("marketPulseBlock (what gemini-chat adds to the prompt)", () => {
  type Row = Record<string, unknown>;
  const db: Record<string, Row[]> = {
    betting_splits: [...armyTemple.rows, ...kcMia.rows, ...ouUga.rows].map((r) => ({ ...r, source: "draftkings" })) as unknown as Row[],
    ncaaf_games: [
      { id: "army-tem", date: "2026-09-26T16:00:00Z", status: "STATUS_SCHEDULED", home_team_name: "Temple Owls", visitor_team_name: "Army Black Knights", time_tbd: false },
      { id: "az-wsu", date: "2026-09-26T23:30:00Z", status: "STATUS_SCHEDULED", home_team_name: "Washington State Cougars", visitor_team_name: "Arizona Wildcats", time_tbd: false },
      { id: "old", date: "2026-09-24T01:00:00Z", status: "STATUS_FINAL", home_team_name: "Kansas State Wildcats", visitor_team_name: "Arizona Wildcats", time_tbd: false },
    ],
    games: [{ id: 1392253, date: "2026-09-27T17:00:00Z", status: "Scheduled", home_team_name: "Miami Dolphins", visitor_team_name: "Kansas City Chiefs", league: "NFL" }],
    betting_lines: [
      ...armyTemple.lines.map((l) => ({ ...l, source: "draftkings", sport: "NCAAF", game_id: "army-tem" })),
      ...azWsu.lines.map((l) => ({ ...l, source: "draftkings", sport: "NCAAF", game_id: "az-wsu" })),
      ...kcMia.lines.map((l) => ({ ...l, source: "draftkings", sport: "NFL", game_id: "1392253" })),
    ],
    ncaaf_odds: [
      // The daily 08:18 row: older than the stored line, so the line shows
      { game_id: "az-wsu", sportsbook: "draftkings", spread_value: 10, spread_odds: -105, moneyline_away: -395, moneyline_home: 310, total_value: 48.5, total_over_odds: -110, total_under_odds: -110, updated_at: "2026-09-24T08:18:24.570778+00:00" },
    ],
    odds: [],
  };
  const reads: string[] = [];
  const client = {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      let range: [number, number] | null = null;
      const special: Record<string, unknown> = {};
      const q: unknown = new Proxy(special, { get: (t, p) => (p in t ? t[p as string] : () => q) });
      for (const op of ["eq", "in", "gte", "lte"]) {
        special[op] = (col: string, val: unknown) => {
          filters.push([op, col, val]);
          return q;
        };
      }
      special.range = (from: number, to: number) => {
        range = [from, to];
        return q;
      };
      special.then = (resolve: (v: unknown) => unknown) => {
        reads.push(table);
        let rows = (db[table] ?? []).filter((r) =>
          filters.every(([op, col, val]) =>
            op === "eq"
              ? String(r[col]) === String(val)
              : op === "in"
                ? (val as unknown[]).map(String).includes(String(r[col]))
                : op === "gte"
                  ? String(r[col]) >= String(val)
                  : String(r[col]) <= String(val),
          ),
        );
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      };
      return q;
    },
  };

  it("answers \"what's public on for both sides\" with the game's split, markers and line", async () => {
    reads.length = 0;
    clearPlayerNames();
    const block = await marketPulseBlock(client, "What's public on for both sides of Army Temple?", "general", null, now);
    expect(block).toContain("Army Black Knights @ Temple Owls (NCAAF, Sat 12:00 PM ET) · DraftKings split updated 19m ago · line updated 19m ago");
    expect(block).toContain("Over (-118): 63% of bets, 28% of money [public side] | Under (-102): 38% of bets, 72% of money [sharp money, reverse line move]");
    // Plus the players' names, read once per process (player-names.ts)
    expect(new Set(reads)).toEqual(
      new Set(["betting_splits", "ncaaf_games", "games", "players", "ncaaf_draft_prospects", "betting_lines", "ncaaf_odds"]),
    );
  });

  it("gives a game DraftKings posted no split for its line, and nothing to a basketball question", async () => {
    // resolveLeague reads "Arizona Washington State" in September as NCAAF
    const block = await marketPulseBlock(client, "sharp money Arizona Washington State", "general", "NCAAF", now);
    expect(await marketPulseBlock(client, "Duke basketball tonight", "games", "NCAAB", now)).toBe("");
    expect(await marketPulseBlock(client, "Arizona Washington State odds", "odds", null, now)).toContain("Arizona Wildcats @ Washington State Cougars");
    expect(block).toContain("Arizona Wildcats @ Washington State Cougars (NCAAF, Sat 7:30 PM ET) · no DraftKings public split posted for this game");
    expect(block).toContain("- Moneyline: Arizona Wildcats -410 | Washington State Cougars +320 | Open -575 / +425 → Now -410 / +320 (away / home)");
    expect(block).not.toContain("-395");
  });

  it("covers NFL games too, and stays out of questions it has nothing to add to", async () => {
    expect(await marketPulseBlock(client, "Chiefs Dolphins public betting", "general", "NFL", now)).toContain(
      "Kansas City Chiefs @ Miami Dolphins (NFL, Sun 1:00 PM ET)",
    );
    reads.length = 0;
    expect(await marketPulseBlock(client, "Who leads the NFL in rushing?", "player_stats", "NFL", now)).toBe("");
    expect(await marketPulseBlock(client, "sharp money on the Chiefs", "general", "NFL", new Date("2026-06-15T12:00:00Z"))).toBe("");
    expect(reads).toEqual([]);
  });

  it("reads nothing for a question that names no team and is not about splits", async () => {
    reads.length = 0;
    for (const q of ["What games are on tonight?", "Any good college football odds this weekend?", "who is favored this week"]) {
      expect(await marketPulseBlock(client, q, "games", null, now), q).toBe("");
    }
    expect(reads).toEqual([]);
    // A team name, even one no keyword list knows, still reads
    await marketPulseBlock(client, "Army Temple odds", "odds", null, now);
    expect(reads).toContain("betting_splits");
  });
});

// QC round 3: "St. Louis Cardinals odds" and "Louisville Cardinals odds" got
// the Arizona Cardinals @ 49ers DraftKings block, "San Francisco Giants odds"
// the Titans @ Giants one. A label hit now has to belong to the team the
// question's city or school words name.
describe("wrong-game guard: a city or school that is not the matched game's team", () => {
  // Week 4 as stored after the 11:52 run: the NFL Cardinals and Giants play
  // Sunday; Louisville hosts Wake Forest, Cincinnati hosts Kansas State, and
  // both Miamis are home Saturday
  const nfl = groupSplitGames([
    ...splitRows("NFL", "1392258", "ARI Cardinals @ SF 49ers", "Arizona Cardinals", "San Francisco 49ers", "2026-09-27T20:05:00Z", [
      ["spread", "away", 30, 13],
      ["spread", "home", 70, 87],
    ]),
    ...splitRows("NFL", "1392254", "TEN Titans @ NY Giants", "Tennessee Titans", "New York Giants", "2026-09-27T17:00:00Z", [
      ["spread", "away", 59, 84],
      ["spread", "home", 41, 16],
    ]),
    ...splitRows("NFL", "1392251", "NY Jets @ DET Lions", "New York Jets", "Detroit Lions", "2026-09-27T17:00:00Z", [
      ["spread", "away", 34, 10],
      ["spread", "home", 66, 90],
    ]),
    ...splitRows("NFL", "1392250", "CAR Panthers @ CLE Browns", "Carolina Panthers", "Cleveland Browns", "2026-09-27T17:00:00Z", [
      ["spread", "away", 83, 97],
      ["spread", "home", 17, 3],
    ]),
  ]);
  const collegeRows = [
    { id: "wake-lou", date: "2026-09-26T16:00:00Z", status: "STATUS_SCHEDULED", home_team_name: "Louisville Cardinals", visitor_team_name: "Wake Forest Demon Deacons", time_tbd: false },
    { id: "ksu-cin", date: "2026-09-26T23:00:00Z", status: "STATUS_SCHEDULED", home_team_name: "Cincinnati Bearcats", visitor_team_name: "Kansas State Wildcats", time_tbd: false },
    { id: "uconn-moh", date: "2026-09-26T19:30:00Z", status: "STATUS_SCHEDULED", home_team_name: "Miami (OH) RedHawks", visitor_team_name: "UConn Huskies", time_tbd: false },
    { id: "cmu-mia", date: "2026-09-26T22:30:00Z", status: "STATUS_SCHEDULED", home_team_name: "Miami Hurricanes", visitor_team_name: "Central Michigan Chippewas", time_tbd: false },
    { id: "az-wsu", date: "2026-09-26T23:30:00Z", status: "STATUS_SCHEDULED", home_team_name: "Washington State Cougars", visitor_team_name: "Arizona Wildcats", time_tbd: false },
  ];
  const slate: SplitsGame[] = [...nfl, ...lineOnlyGames("NCAAF", collegeRows)];
  const game = (q: string, games: SplitsGame[] = slate) => findSplitsGame(q, games, now)?.gameId ?? null;

  it("never gives a baseball, hockey or other school's team a football game that shares a word (the app's stored-splits path)", () => {
    // The blockers
    expect(game("St. Louis Cardinals odds")).toBeNull();
    expect(game("San Francisco Giants odds")).toBeNull();
    expect(game("Louisville Cardinals odds")).toBe("wake-lou");
    // MLB teams whose city a football team on the slate shares
    for (const q of [
      "Cincinnati Reds odds tonight",
      "Arizona Diamondbacks odds tonight",
      "Miami Marlins odds tonight",
      "Detroit Tigers odds tonight",
      "New York Mets odds tonight",
      "Cleveland Guardians odds tonight",
    ]) {
      expect(game(q), q).toBeNull();
    }
    // NHL teams that share a nickname or a city
    for (const q of ["Winnipeg Jets odds", "Florida Panthers odds", "Carolina Hurricanes odds", "New York Rangers odds"]) {
      expect(game(q), q).toBeNull();
    }
  });

  it("still finds the team a city or school and nickname name", () => {
    expect(game("Arizona Cardinals odds")).toBe("1392258");
    expect(game("New York Giants odds")).toBe("1392254");
    expect(game("NY Jets spread")).toBe("1392251");
    expect(game("Carolina Panthers spread")).toBe("1392250");
    expect(game("Arizona Wildcats odds")).toBe("az-wsu");
    expect(game("Cincinnati Bearcats odds")).toBe("ksu-cin");
    expect(game("Miami Hurricanes odds")).toBe("cmu-mia");
    expect(game("Miami RedHawks odds")).toBe("uconn-moh");
    expect(game("Miami (OH) odds")).toBe("uconn-moh");
    // A bare nickname is the league resolver's call; the matcher alone takes the pro team, as before
    expect(game("Cardinals odds")).toBe("1392258");
  });

  it("never gives the Arizona Cardinals the Arizona Wildcats' game, or Kansas City Kansas's", () => {
    expect(game("Arizona Cardinals odds", slate.filter((g) => g.gameId !== "1392258"))).toBeNull();
    const kansas = lineOnlyGames("NCAAF", [
      { id: "kan", date: "2026-09-26T20:00:00Z", status: "STATUS_SCHEDULED", home_team_name: "Kansas Jayhawks", visitor_team_name: "West Virginia Mountaineers", time_tbd: false },
    ]);
    for (const q of ["Kansas City Chiefs odds", "Kansas City Royals odds tonight", "Kansas City odds"]) {
      expect(game(q, kansas), q).toBeNull();
    }
    expect(game("Kansas odds", kansas)).toBe("kan");
  });

  // The block gemini-chat builds, with the league resolveLeague gives the question
  type Row = Record<string, unknown>;
  const db: Record<string, Row[]> = {
    betting_splits: nfl.flatMap((g) => g.rows).map((r) => ({ ...r, source: "draftkings" })) as unknown as Row[],
    ncaaf_games: collegeRows,
    games: [
      { id: 1392258, date: "2026-09-27T20:05:00Z", status: "Scheduled", home_team_name: "San Francisco 49ers", visitor_team_name: "Arizona Cardinals", league: "NFL" },
      { id: 1392254, date: "2026-09-27T17:00:00Z", status: "Scheduled", home_team_name: "New York Giants", visitor_team_name: "Tennessee Titans", league: "NFL" },
    ],
  };
  const client = {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      let range: [number, number] | null = null;
      const special: Record<string, unknown> = {};
      const q: unknown = new Proxy(special, { get: (t, p) => (p in t ? t[p as string] : () => q) });
      for (const op of ["eq", "in", "gte", "lte"]) {
        special[op] = (col: string, val: unknown) => {
          filters.push([op, col, val]);
          return q;
        };
      }
      special.range = (from: number, to: number) => {
        range = [from, to];
        return q;
      };
      special.then = (resolve: (v: unknown) => unknown) => {
        let rows = (db[table] ?? []).filter((r) =>
          filters.every(([op, col, val]) =>
            op === "eq"
              ? String(r[col]) === String(val)
              : op === "in"
                ? (val as unknown[]).map(String).includes(String(r[col]))
                : op === "gte"
                  ? String(r[col]) >= String(val)
                  : String(r[col]) <= String(val),
          ),
        );
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      };
      return q;
    },
  };
  /** The games a block covers, by their head line */
  const blockGames = async (q: string, intent = "odds", league: string | null = leagueFor(q, now)) =>
    (await marketPulseBlock(client, q, intent, league, now))
      .split("\n")
      .filter((l) => l.includes(" @ "))
      .map((l) => l.split(" · ")[0]);

  it("injects no wrong game for each blocker phrasing", async () => {
    expect(leagueFor("St. Louis Cardinals odds", now)).toBe("MLB");
    expect(await blockGames("St. Louis Cardinals odds")).toEqual([]);
    expect(leagueFor("San Francisco Giants odds", now)).toBe("MLB");
    expect(await blockGames("San Francisco Giants odds")).toEqual([]);
    expect(leagueFor("Louisville Cardinals odds", now)).toBe("NCAAF");
    expect(await blockGames("Louisville Cardinals odds")).toEqual(["Wake Forest Demon Deacons @ Louisville Cardinals (NCAAF, Sat 12:00 PM ET)"]);
    // With no league at all, the guard alone keeps the NFL games out
    for (const q of ["St. Louis Cardinals odds", "San Francisco Giants odds", "St. Louis Cardinals public betting", "San Francisco Giants splits"]) {
      expect(await blockGames(q, "odds", null), q).toEqual([]);
    }
    expect(await blockGames("Louisville Cardinals public betting", "general", null)).toEqual([
      "Wake Forest Demon Deacons @ Louisville Cardinals (NCAAF, Sat 12:00 PM ET)",
    ]);
  });

  it("the right game still comes through, and a bare nickname waits for the league", async () => {
    expect(await blockGames("Arizona Cardinals odds")).toEqual(["Arizona Cardinals @ San Francisco 49ers (NFL, Sun 4:05 PM ET)"]);
    expect(await blockGames("New York Giants odds")).toEqual(["Tennessee Titans @ New York Giants (NFL, Sun 1:00 PM ET)"]);
    // "Cardinals odds" with the NFL and MLB both playing: no league, so no block
    expect(leagueFor("Cardinals odds", now)).toBeNull();
    expect(await blockGames("Cardinals odds")).toEqual([]);
    // Once the schedule settles it (resolveLeague), that league's game or none
    expect(await blockGames("Cardinals odds", "odds", "NFL")).toEqual(["Arizona Cardinals @ San Francisco 49ers (NFL, Sun 4:05 PM ET)"]);
    expect(await blockGames("Cardinals odds tonight", "odds", "MLB")).toEqual([]);
  });

  it("a splits question about a team with no game here gets no other games", async () => {
    expect(await blockGames("Winnipeg Jets public betting", "general", null)).toEqual([]);
    expect(await blockGames("where is the public on the Kansas Jayhawks", "general", "NCAAF")).toEqual([]);
    // No team named: the week's games, as before
    expect((await blockGames("NFL public betting this week", "general", "NFL")).length).toBeGreaterThan(0);
  });
});

// QC round 4: one-word trims of school names ("new" from New Mexico, "old"
// from Old Dominion, "central" from Central Arkansas, "west", "east",
// "boston" from Boston College) matched questions about other places. A game
// now matches only through its teams' real names, and a city several teams
// playing this week share ("Houston") names none of them: the chat gets a
// one-line cue to ask which team instead of a guessed game.
describe("real names only; a city several teams share is no guess", () => {
  // Week 4 as stored (ncaaf_games and the NFL games), Thursday Sep 24 2026
  const college = lineOnlyGames(
    "NCAAF",
    [
      ["987bd93b", "2026-09-26T19:30:00Z", "New Mexico Lobos", "New Mexico State Aggies"],
      ["4ee6330e", "2026-09-26T19:00:00Z", "Central Arkansas Bears", "Florida State Seminoles"],
      ["a3c08473", "2026-09-26T19:30:00Z", "TCU Horned Frogs", "UCF Knights"],
      ["58492a77", "2026-09-26T22:00:00Z", "James Madison Dukes", "Old Dominion Monarchs"],
      ["c4d5c47c", "2026-09-26T19:30:00Z", "Ole Miss Rebels", "Florida Gators"],
      ["1c1d7e17", "2026-09-26T23:00:00Z", "Oklahoma State Cowboys", "West Virginia Mountaineers"],
      ["ed7594c1", "2026-09-26T20:00:00Z", "North Carolina Central Eagles", "East Carolina Pirates"],
      ["565aa94c", "2026-09-26T16:00:00Z", "Virginia Tech Hokies", "Boston College Eagles"],
      ["78137475", "2026-09-26T20:00:00Z", "Houston Cougars", "Georgia Southern Eagles"],
      ["2786a89e", "2026-09-26T16:00:00Z", "Bucknell Bison", "Pittsburgh Panthers"],
      ["d053a92a", "2026-09-26T19:30:00Z", "Robert Morris Colonials", "Buffalo Bulls"],
      ["cfc9ec2f", "2026-09-26T22:30:00Z", "Central Michigan Chippewas", "Miami Hurricanes"],
      ["6e8fb924", "2026-09-26T19:30:00Z", "UConn Huskies", "Miami (OH) RedHawks"],
      ["df988ca5", "2026-09-26T23:30:00Z", "Arizona Wildcats", "Washington State Cougars"],
      ["f1e6bca9", "2026-09-27T03:00:00Z", "Minnesota Golden Gophers", "Washington Huskies"],
      ["f098f115", "2026-09-26T23:00:00Z", "Kansas State Wildcats", "Cincinnati Bearcats"],
      ["60804fe9", "2026-09-26T16:00:00Z", "Texas Longhorns", "Tennessee Volunteers"],
      ["d3bfb3c6", "2026-09-26T23:00:00Z", "South Carolina Gamecocks", "Alabama Crimson Tide"],
      ["fe305144", "2026-09-26T02:30:00Z", "Clemson Tigers", "California Golden Bears"],
      ["d5d90b97", "2026-09-26T23:30:00Z", "Oregon Ducks", "USC Trojans"],
      ["358faca0", "2026-09-26T19:30:00Z", "William & Mary Tribe", "Duke Blue Devils"],
    ].map(([id, date, away, home]) => ({ id, date, status: "STATUS_SCHEDULED", visitor_team_name: away, home_team_name: home, time_tbd: false })),
  );
  const nflRows = [
    [1392249, "2026-09-27T17:00:00Z", "Los Angeles Chargers", "Buffalo Bills"],
    [1392251, "2026-09-27T17:00:00Z", "New York Jets", "Detroit Lions"],
    [1392252, "2026-09-27T17:00:00Z", "Houston Texans", "Indianapolis Colts"],
    [1392253, "2026-09-27T17:00:00Z", "Kansas City Chiefs", "Miami Dolphins"],
    [1392254, "2026-09-27T17:00:00Z", "Tennessee Titans", "New York Giants"],
    [1392255, "2026-09-27T17:00:00Z", "Cincinnati Bengals", "Pittsburgh Steelers"],
    [1392256, "2026-09-27T17:00:00Z", "Seattle Seahawks", "Washington Commanders"],
    [1392257, "2026-09-27T17:00:00Z", "New England Patriots", "Jacksonville Jaguars"],
    [1392258, "2026-09-27T20:05:00Z", "Arizona Cardinals", "San Francisco 49ers"],
    [1392259, "2026-09-27T20:05:00Z", "Minnesota Vikings", "Tampa Bay Buccaneers"],
    [1392261, "2026-09-27T20:25:00Z", "Las Vegas Raiders", "New Orleans Saints"],
  ].map(([id, date, away, home]) => ({ id, date, status: "Scheduled", visitor_team_name: away, home_team_name: home, league: "NFL" }));
  const slate: SplitsGame[] = [...college, ...lineOnlyGames("NFL", nflRows as never)];
  const game = (q: string, league?: string | null) => findSplitsGame(q, slate, now, { league })?.gameId ?? null;

  it("never matches a generic word: New York, New England, New Orleans, Old Miss, West Coast, east coast, Boston", () => {
    for (const q of ["New York odds", "who is the public on in New York tonight", "Old Miss odds", "West Coast odds tonight", "odds for the east coast games"]) {
      expect(game(q), q).toBeNull();
    }
    // Boston College plays; "Boston" is the Red Sox's city, not the school
    expect(game("Boston odds tonight")).toBeNull();
    // The right team when a place names one: the Patriots, the Saints
    expect(game("New England odds")).toBe("1392257");
    expect(game("New Orleans odds")).toBe("1392261");
  });

  it("matches a school by its real names: Central Florida is UCF, Ole Miss, Old Dominion", () => {
    expect(game("Central Florida odds")).toBe("a3c08473"); // TCU @ UCF, not Central Arkansas @ Florida State
    expect(game("Ole Miss odds")).toBe("c4d5c47c");
    expect(game("Old Dominion odds")).toBe("58492a77");
    expect(game("New Mexico odds")).toBe("987bd93b");
    expect(game("West Virginia odds")).toBe("1c1d7e17");
    expect(game("East Carolina odds")).toBe("ed7594c1");
    expect(game("Boston College odds")).toBe("565aa94c");
    expect(game("Florida State odds")).toBe("4ee6330e");
  });

  it("a city several teams playing this week share names none of them", () => {
    for (const city of ["Houston", "Pittsburgh", "Buffalo", "Miami", "Arizona", "Washington", "Minnesota", "Cincinnati", "Tennessee"]) {
      expect(game(`${city} odds`), city).toBeNull();
    }
    // Schools no pro team shares still resolve
    expect(game("Alabama odds")).toBe("d3bfb3c6");
    expect(game("Clemson odds")).toBe("fe305144");
    expect(game("Oregon odds")).toBe("d5d90b97");
    // A league word or the resolved league settles the city
    expect(game("Houston NFL odds")).toBe("1392252");
    expect(game("Houston college football odds")).toBe("78137475");
    expect(game("Houston odds", "NCAAF")).toBe("78137475");
    expect(game("Houston odds", "NFL")).toBe("1392252");
    // Two shared cities that play each other name the game
    expect(game("Minnesota vs Washington odds")).toBe("f1e6bca9");
    expect(game("Cincinnati Pittsburgh spread")).toBe("1392255");
    expect(game("Texas Tennessee odds")).toBe("60804fe9");
    expect(game("Cincinnati Pittsburgh spread", "NFL")).toBe("1392255");
  });

  it("teams of different games get no single guessed game", () => {
    expect(game("Chiefs vs Bills odds")).toBeNull(); // they don't meet this week
    expect(pickPulseGames("Chiefs vs Bills public betting", slate, {}, now).map((g) => g.gameId)).toEqual(["1392253", "1392249"]);
  });

  it("a basketball question never gets a football game", () => {
    expect(game("Duke odds")).toBe("358faca0");
    expect(game("Duke basketball public betting")).toBeNull();
  });

  // The block gemini-chat builds, with leagueFor's league
  type Row = Record<string, unknown>;
  const db: Record<string, Row[]> = {
    betting_splits: [],
    ncaaf_games: college.map((g) => ({ id: g.gameId, date: g.start, status: "STATUS_SCHEDULED", home_team_name: g.home, visitor_team_name: g.away, time_tbd: false })),
    games: nflRows as unknown as Row[],
  };
  const client = {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      const special: Record<string, unknown> = {};
      const q: unknown = new Proxy(special, { get: (t, p) => (p in t ? t[p as string] : () => q) });
      for (const op of ["eq", "in", "gte", "lte"]) {
        special[op] = (col: string, val: unknown) => {
          filters.push([op, col, val]);
          return q;
        };
      }
      special.then = (resolve: (v: unknown) => unknown) => {
        const rows = (db[table] ?? []).filter((r) =>
          filters.every(([op, col, val]) =>
            op === "eq"
              ? String(r[col]) === String(val)
              : op === "in"
                ? (val as unknown[]).map(String).includes(String(r[col]))
                : op === "gte"
                  ? String(r[col]) >= String(val)
                  : String(r[col]) <= String(val),
          ),
        );
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      };
      return q;
    },
  };
  const block = (q: string, intent = "odds") => marketPulseBlock(client, q, intent, leagueFor(q, now), now);
  const heads = async (q: string, intent = "odds") => (await block(q, intent)).split("\n").filter((l) => l.includes(" @ ")).map((l) => l.split(" · ")[0]);

  const IGNORE = " Ignore this line if the question is not about betting on an upcoming game.";

  it("the chat asks which team for a shared city, with the teams that play", async () => {
    expect(leagueFor("Houston odds", now)).toBeNull();
    expect(await block("Houston odds")).toBe(`Ambiguous team 'Houston': ask whether they mean the Cougars (NCAAF), Texans (NFL) or Astros (MLB).${IGNORE}`);
    const cue: Record<string, string> = {
      Pittsburgh: "the Panthers (NCAAF), Steelers (NFL) or Pirates (MLB)",
      Buffalo: "the Bulls (NCAAF) or Bills (NFL)",
      Miami: "the Hurricanes (NCAAF), RedHawks (NCAAF), Dolphins (NFL) or Marlins (MLB)",
      Arizona: "the Wildcats (NCAAF), Cardinals (NFL) or Diamondbacks (MLB)",
      Washington: "the Huskies (NCAAF), Commanders (NFL) or Nationals (MLB)",
      Minnesota: "the Golden Gophers (NCAAF), Vikings (NFL) or Twins (MLB)",
      Cincinnati: "the Bearcats (NCAAF), Bengals (NFL) or Reds (MLB)",
      Tennessee: "the Volunteers (NCAAF) or Titans (NFL)",
    };
    for (const [city, teams] of Object.entries(cue)) {
      expect(await block(`${city} odds`), city).toBe(`Ambiguous team '${city}': ask whether they mean ${teams}.${IGNORE}`);
    }
    expect(await block("New York odds")).toBe(`Ambiguous team 'New York': ask whether they mean the Giants (NFL), Jets (NFL), Mets (MLB) or Yankees (MLB).${IGNORE}`);
    expect(await block("who is the public on in New York tonight", "general")).toContain("Ambiguous team 'New York'");
  });

  it("injects the right game or nothing for every round 4 phrasing", async () => {
    expect(await heads("New England odds")).toEqual(["New England Patriots @ Jacksonville Jaguars (NFL, Sun 1:00 PM ET)"]);
    expect(await heads("New Orleans odds")).toEqual(["Las Vegas Raiders @ New Orleans Saints (NFL, Sun 4:25 PM ET)"]);
    expect(await heads("Central Florida odds")).toEqual(["TCU Horned Frogs @ UCF Knights (NCAAF, Sat 3:30 PM ET)"]);
    expect(await heads("Ole Miss odds")).toEqual(["Ole Miss Rebels @ Florida Gators (NCAAF, Sat 3:30 PM ET)"]);
    expect(await heads("Old Dominion odds")).toEqual(["James Madison Dukes @ Old Dominion Monarchs (NCAAF, Sat 6:00 PM ET)"]);
    expect(await heads("Alabama odds")).toEqual(["South Carolina Gamecocks @ Alabama Crimson Tide (NCAAF, Sat 7:00 PM ET)"]);
    for (const q of ["Old Miss odds", "West Coast odds tonight", "odds for the east coast games", "Boston odds tonight"]) {
      expect(await block(q, q.includes("games") ? "games" : "odds"), q).toBe("");
    }
  });
});

// A school whose bare name is also a surname, first name or word ("Rashee
// Rice", "Troy Franklin", "Marshall Faulk", "navy blue") names the school only
// with something saying so: its nickname, "University", a college word, its
// opponent, or a betting word around it. After a first name it's a person.
describe("a school that is also a surname or a word", () => {
  // The schools' 2026 games (ncaaf_games): this week's with DraftKings'
  // split and short names ("Rice", "Navy": the labels a player's name must
  // not hit), then later ones by line only; the Army-Navy game (Dec 12) is
  // not in the table yet
  const spread: Side[] = [
    ["spread", "away", 50, 50],
    ["spread", "home", 50, 50],
  ];
  const college = [
    ...groupSplitGames([
      ...splitRows("NCAAF", "ca78e9b1", "Liberty @ Coastal Carolina", "Liberty Flames", "Coastal Carolina Chanticleers", "2026-09-24T23:30:00Z", spread),
      ...splitRows("NCAAF", "118ab08c", "Army @ Temple", "Army Black Knights", "Temple Owls", "2026-09-25T20:00:00Z", spread),
      ...splitRows("NCAAF", "15508010", "Navy @ UAB", "Navy Midshipmen", "UAB Blazers", "2026-09-25T23:00:00Z", spread),
      ...splitRows("NCAAF", "358faca0", "William & Mary @ Duke", "William & Mary Tribe", "Duke Blue Devils", "2026-09-26T19:30:00Z", spread),
      ...splitRows("NCAAF", "936d2b02", "Gardner-Webb @ Marshall", "Gardner-Webb Runnin' Bulldogs", "Marshall Thundering Herd", "2026-09-26T19:30:00Z", spread),
      ...splitRows("NCAAF", "694ccae9", "Troy @ Utah St.", "Troy Trojans", "Utah State Aggies", "2026-09-26T23:30:00Z", spread),
      ...splitRows("NCAAF", "93b4ea47", "Rice @ Fresno St.", "Rice Owls", "Fresno State Bulldogs", "2026-09-27T02:00:00Z", spread),
      ...splitRows("NCAAF", "f1e6bca9", "Minnesota @ Washington", "Minnesota Golden Gophers", "Washington Huskies", "2026-09-27T03:00:00Z", spread),
    ]),
    ...lineOnlyGames(
      "NCAAF",
      [
        ["ed9a10ec", "2026-11-07T20:30:00Z", "Temple Owls", "Navy Midshipmen"],
        ["d6d970b0", "2026-11-20T00:30:00Z", "Rice Owls", "Temple Owls"],
        ["92b4e972", "2026-11-28T05:00:00Z", "Army Black Knights", "Rice Owls"],
        ["army-navy", "2026-12-12T20:00:00Z", "Army Black Knights", "Navy Midshipmen"],
      ].map(([id, date, away, home]) => ({ id, date, status: "STATUS_SCHEDULED", visitor_team_name: away, home_team_name: home, time_tbd: false })),
    ),
  ];
  const nfl = lineOnlyGames("NFL", [
    { id: 1392256, date: "2026-09-27T17:00:00Z", status: "Scheduled", visitor_team_name: "Seattle Seahawks", home_team_name: "Washington Commanders" },
    { id: 1392260, date: "2026-09-27T20:25:00Z", status: "Scheduled", visitor_team_name: "Baltimore Ravens", home_team_name: "Dallas Cowboys" },
  ]);
  const slate: SplitsGame[] = [...college, ...nfl];
  const game = (q: string) => findSplitsGame(q, slate, now)?.gameId ?? null;

  it("never takes a player's name, or an everyday word, for the school", () => {
    for (const q of [
      "Rashee Rice odds",
      "Troy Franklin props",
      "Tyler Warren Temple",
      "Jaxson Dart",
      "Emeka Egbuka Navy",
      "is Christian Kirk playing",
      "Marshall Faulk",
      // No capitals to go on: the name-like school still needs corroboration
      "rashee rice odds",
      "troy franklin props",
      "tyler warren temple",
      "emeka egbuka navy",
      "marshall faulk",
      "Dallas Goedert odds",
      "Darnell Washington odds",
      "Duke Johnson odds",
      "navy blue jerseys",
    ]) {
      expect(game(q), q).toBeNull();
    }
  });

  it("still finds the school by its nickname, its opponent, University, a college word or a betting word", () => {
    expect(game("Rice Owls odds")).toBe("93b4ea47");
    expect(game("Rice vs Army")).toBe("92b4e972");
    expect(game("Troy Trojans spread")).toBe("694ccae9");
    expect(game("Navy Midshipmen public")).toBe("15508010");
    expect(game("Army Navy odds")).toBe("army-navy");
    expect(game("Temple Owls")).toBe("118ab08c");
    expect(game("Rice odds")).toBe("93b4ea47");
    expect(game("Is Temple favored?")).toBe("118ab08c");
    expect(game("Liberty spread")).toBe("ca78e9b1");
    expect(game("Rice University odds")).toBe("93b4ea47");
    expect(game("college football Troy line")).toBe("694ccae9");
    expect(game("Dallas odds")).toBe("1392260");
  });

  it("the chat's block gets no game for a player question", async () => {
    const empty = { from: () => new Proxy({}, { get: (_t, p) => (p === "then" ? (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r) : () => empty.from()) }) };
    for (const q of ["Rashee Rice odds", "Emeka Egbuka Navy odds", "Dallas Goedert odds", "Troy Franklin props"]) {
      expect(leagueFor(q, now), q).toBeNull();
      expect(await marketPulseBlock(empty, q, "odds", leagueFor(q, now), now), q).toBe("");
    }
  });
});

// QC round 5: a player question that names a school ("jalen hurts alabama",
// "Bryce Young Alabama") got that school's current game. The block now needs
// betting or game intent in the question, and beside a known player's name
// (the players table and the draft board) a school counts only with a strong
// cue: its nickname, its opponent, or a game word right next to it.
describe("a player's school is not a game to price", () => {
  // This week's games for the players' schools (ncaaf_games, Sep 24 2026)
  const collegeRows = [
    ["fe305144", "2026-09-26T02:30:00Z", "Clemson Tigers", "California Golden Bears"],
    ["8f5452e0", "2026-09-26T16:00:00Z", "Wake Forest Demon Deacons", "Louisville Cardinals"],
    ["05975056", "2026-09-26T16:00:00Z", "Colorado Buffaloes", "Baylor Bears"],
    ["4b50a661", "2026-09-26T16:00:00Z", "Sam Houston Bearkats", "Texas Tech Red Raiders"],
    ["0e38597d", "2026-09-26T16:00:00Z", "Illinois Fighting Illini", "Ohio State Buckeyes"],
    ["d41b60ec", "2026-09-26T19:00:00Z", "Hawai'i Rainbow Warriors", "Wyoming Cowboys"],
    ["3e8ee2fd", "2026-09-26T19:30:00Z", "Oklahoma Sooners", "Georgia Bulldogs"],
    ["c4d5c47c", "2026-09-26T19:30:00Z", "Ole Miss Rebels", "Florida Gators"],
    ["9c7f01e9", "2026-09-26T19:30:00Z", "Iowa Hawkeyes", "Michigan Wolverines"],
    ["1128b9af", "2026-09-26T19:30:00Z", "Boise State Broncos", "Western Michigan Broncos"],
    ["305646bd", "2026-09-26T19:30:00Z", "Utah Utes", "Iowa State Cyclones"],
    ["5dc4c7ac", "2026-09-26T21:00:00Z", "Wisconsin Badgers", "Penn State Nittany Lions"],
    ["cfc9ec2f", "2026-09-26T22:30:00Z", "Central Michigan Chippewas", "Miami Hurricanes"],
    ["d3bfb3c6", "2026-09-26T23:00:00Z", "South Carolina Gamecocks", "Alabama Crimson Tide"],
    ["d5d90b97", "2026-09-26T23:30:00Z", "Oregon Ducks", "USC Trojans"],
    ["df988ca5", "2026-09-26T23:30:00Z", "Arizona Wildcats", "Washington State Cougars"],
    ["7d564c01", "2026-09-26T23:30:00Z", "Texas A&M Aggies", "LSU Tigers"],
    ["fcf84e11", "2026-09-27T01:00:00Z", "Missouri State Bears", "SMU Mustangs"],
  ].map(([id, date, away, home]) => ({ id, date, status: "STATUS_SCHEDULED", visitor_team_name: away, home_team_name: home, time_tbd: false }));
  // Their names as the players table stores them (NFL, all active)
  const playerNames = [
    "Jalen Hurts", "DeVonta Smith", "Tyler Shough", "Garrett Wilson", "C.J. Stroud", "Colston Loveland", "Caleb Williams",
    "Bryce Young", "Joe Burrow", "Ja'Marr Chase", "Justin Jefferson", "Jayden Daniels", "Malik Nabers", "Kyler Murray",
    "Baker Mayfield", "CeeDee Lamb", "Bo Nix", "Justin Herbert", "Patrick Mahomes", "Josh Allen", "Brock Purdy",
    "Trevor Lawrence", "Marvin Harrison Jr.", "Jaxon Smith-Njigba", "J.J. McCarthy", "Amon-Ra St. Brown", "Drake London",
    "Tua Tagovailoa", "Lamar Jackson", "Shedeur Sanders", "Cam Ward", "Tetairoa McMillan", "Ashton Jeanty", "Tyler Warren",
    "Jaxson Dart", "Christian Kirk", "Rashee Rice",
  ];
  const slate = lineOnlyGames("NCAAF", collegeRows);
  const players = indexPlayerNames(playerNames);
  // QC's 42: the player-plus-school phrasings (lowercase and capitalized) and the natural ones
  const playerQuestions = [
    "jalen hurts alabama", "jalen hurts oklahoma", "devonta smith alabama", "tyler shough louisville", "garrett wilson ohio state",
    "cj stroud ohio state", "colston loveland michigan", "caleb williams usc", "bryce young alabama", "joe burrow lsu",
    "jamarr chase lsu", "justin jefferson lsu", "jayden daniels lsu", "malik nabers lsu", "kyler murray oklahoma",
    "baker mayfield oklahoma", "ceedee lamb oklahoma", "bo nix oregon", "justin herbert oregon", "patrick mahomes texas tech",
    "josh allen wyoming", "brock purdy iowa state", "trevor lawrence clemson", "marvin harrison jr ohio state",
    "jaxon smith-njigba ohio state", "jj mccarthy michigan", "amon-ra st brown usc", "drake london usc", "tua tagovailoa alabama",
    "lamar jackson louisville", "shedeur sanders colorado", "cam ward miami", "tetairoa mcmillan arizona", "ashton jeanty boise state",
    "tyler warren penn state", "jaxson dart ole miss", "christian kirk texas a&m", "rashee rice smu",
    "who did jalen hurts play for in college alabama", "was bryce young better at alabama", "Bryce Young Alabama",
    "sharp money jalen hurts alabama",
  ];

  it("the app's matcher gives none of QC's 42 player phrasings a game", () => {
    expect(playerQuestions).toHaveLength(42);
    for (const q of playerQuestions) expect(findSplitsGame(q, slate, now, { players })?.gameId ?? null, q).toBeNull();
    // A game word right beside the school is the strong cue that it is the game
    expect(findSplitsGame("jalen hurts alabama spread", slate, now, { players })?.gameId).toBe("d3bfb3c6");
  });

  type Row = Record<string, unknown>;
  const db: Record<string, Row[]> = {
    betting_splits: [],
    ncaaf_games: collegeRows,
    games: [],
    players: playerNames.map((name) => ({ name, sport: "NFL" })),
    ncaaf_draft_prospects: [{ player_name: "Will Echoles" }],
  };
  const reads: string[] = [];
  const client = {
    from(table: string) {
      const special: Record<string, unknown> = {};
      const q: unknown = new Proxy(special, { get: (t, p) => (p in t ? t[p as string] : () => q) });
      special.then = (resolve: (v: unknown) => unknown) => {
        reads.push(table);
        return Promise.resolve({ data: db[table] ?? [], error: null }).then(resolve);
      };
      return q;
    },
  };
  const heads = async (q: string) =>
    (await marketPulseBlock(client, q, "general", leagueFor(q, now), now))
      .split("\n")
      .filter((l) => l.includes(" @ "))
      .map((l) => l.split(" · ")[0]);

  it("the chat injects no block for any of them", async () => {
    clearPlayerNames();
    for (const q of playerQuestions) expect(await marketPulseBlock(client, q, "general", leagueFor(q, now), now), q).toBe("");
  });

  it("a game question still gets its game", async () => {
    clearPlayerNames();
    expect(await heads("Alabama odds")).toEqual(["South Carolina Gamecocks @ Alabama Crimson Tide (NCAAF, Sat 7:00 PM ET)"]);
    expect(await heads("Alabama spread")).toEqual(["South Carolina Gamecocks @ Alabama Crimson Tide (NCAAF, Sat 7:00 PM ET)"]);
    expect(await heads("alabama game tonight")).toEqual(["South Carolina Gamecocks @ Alabama Crimson Tide (NCAAF, Sat 7:00 PM ET)"]);
    expect(await heads("Ohio State Illinois line")).toEqual(["Illinois Fighting Illini @ Ohio State Buckeyes (NCAAF, Sat 12:00 PM ET)"]);
    expect(await heads("Michigan Iowa public betting")).toEqual(["Iowa Hawkeyes @ Michigan Wolverines (NCAAF, Sat 3:30 PM ET)"]);
    expect(await heads("USC Oregon odds")).toEqual(["Oregon Ducks @ USC Trojans (NCAAF, Sat 7:30 PM ET)"]);
    expect(await heads("Louisville Wake Forest spread")).toEqual(["Wake Forest Demon Deacons @ Louisville Cardinals (NCAAF, Sat 12:00 PM ET)"]);
  });

  it("a stats question reads nothing", async () => {
    reads.length = 0;
    expect(await marketPulseBlock(client, "Jalen Hurts stats", "player_stats", leagueFor("Jalen Hurts stats", now), now)).toBe("");
    expect(await marketPulseBlock(client, "was bryce young better at alabama", "general", null, now)).toBe("");
    expect(reads).toEqual([]);
  });
});

// QC round 8: a question with any word the generic list can't account for (a
// weak school, "to cover", "top 25", "HBCU", "late games") fell through to the
// five-game list. The list is now whitelist-only (LIST_WORDS, listScope), the
// weekday nights and NFL prime time are real scopes, "<school> states" is the
// State school, and futures, past seasons and "Draft Kings" read right.
describe("the generic list is whitelist-only (QC round 8)", () => {
  const game = (sport: string, start: string, away = "Away Team", home = "Home Team"): SplitsGame => ({
    sport,
    gameId: `${sport}-${start}`,
    away,
    home,
    start,
    rows: [],
    lines: [],
    labels: { away: [], home: [] },
  });
  // now is Thu Sep 24 2026, 8:12 AM ET
  const thuCollege730 = game("NCAAF", "2026-09-24T23:30:00Z", "Liberty Flames", "Coastal Carolina Chanticleers");
  const tnf = game("NFL", "2026-09-25T00:15:00Z", "Atlanta Falcons", "Green Bay Packers");
  const friCollege400 = game("NCAAF", "2026-09-25T20:00:00Z", "Army Black Knights", "Temple Owls");
  const friCollege700 = game("NCAAF", "2026-09-25T23:00:00Z", "Navy Midshipmen", "UAB Blazers");
  const satCollege659 = game("NCAAF", "2026-09-26T22:59:00Z", "Delaware Blue Hens", "Virginia Cavaliers");
  const satCollege700 = game("NCAAF", "2026-09-26T23:00:00Z", "South Carolina Gamecocks", "Alabama Crimson Tide");
  const sunNfl100 = game("NFL", "2026-09-27T17:00:00Z", "Kansas City Chiefs", "Miami Dolphins");
  const snf = game("NFL", "2026-09-28T00:20:00Z", "Los Angeles Rams", "Denver Broncos");
  const mnf = game("NFL", "2026-09-29T00:15:00Z", "Philadelphia Eagles", "Chicago Bears");
  const all = [thuCollege730, tnf, friCollege400, friCollege700, satCollege659, satCollege700, sunNfl100, snf, mnf];
  const scoped = (q: string) => {
    const scope = listScope(q, now);
    return scope ? all.filter(scope.includes).map((g) => g.away) : null;
  };

  it("accepts only pulse, scope and filler words", () => {
    for (const q of [
      "public betting",
      "where is the sharp money this weekend?",
      "who's the public on tonight",
      "SEC public betting",
      "sharp money ACC games",
      "AFC East public betting",
      "C-USA public betting",
      "saturday night public betting",
      "public betting on the Saturday night games",
      "primetime sharp money",
      "prime time public betting",
      "thursday night college football public betting",
      "DraftKings splits tonight",
      "draft kings public betting this weekend",
      "show me the betting percentages for this week's games",
    ]) {
      expect(listScope(q, now), q).not.toBeNull();
    }
    for (const q of [
      // A school of any strength, and the qualifiers after it
      "public betting on Georgia to cover",
      "public betting on Temple to cover",
      "sharp money on Houston to win",
      "sharp money on the Georgia side",
      "where's the sharp money on Clemson going",
      "public betting Rice",
      // A person
      "Mac Jones public betting",
      "Troy Franklin sharp money",
      // Scopes the list can't filter by, and qualifiers
      "late games public betting",
      "early games sharp money",
      "noon games public betting",
      "night games public betting",
      "public betting top 25 games",
      "public betting on ranked matchups",
      "Group of Five public betting",
      "Power 4 sharp money",
      "FCS public betting",
      "SWAC public betting",
      "Ivy League sharp money",
      "HBCU public betting",
      "rivalry games public betting",
      "west coast games public betting",
      "which side is the public on this weekend",
      "biggest public sides this weekend",
      "public betting next week",
      "public betting week 4",
      "Heisman public betting",
      "public betting on the NFL draft",
      "CFL public betting",
    ]) {
      expect(listScope(q, now), q).toBeNull();
    }
  });

  it("no team's name is made of list words alone", () => {
    const phrases = new Set(TEAMS.flatMap((t) => [...t.locations, ...t.nicknames]));
    expect([...phrases].filter((p) => p.split(" ").every((w) => LIST_WORDS.has(w)))).toEqual([]);
  });

  it("a weekday night is that date from 7 PM ET; NFL prime time is TNF, SNF and MNF", () => {
    expect(scoped("saturday night public betting")).toEqual(["South Carolina Gamecocks"]);
    expect(scoped("friday night sharp money")).toEqual(["Navy Midshipmen"]);
    expect(scoped("thursday night public betting")).toEqual(["Liberty Flames", "Atlanta Falcons"]);
    expect(scoped("thursday night college football public betting")).toEqual(["Liberty Flames"]);
    expect(scoped("thursday night football public betting")).toEqual(["Atlanta Falcons"]);
    expect(scoped("TNF public betting")).toEqual(["Atlanta Falcons"]);
    expect(scoped("sunday night public betting")).toEqual(["Los Angeles Rams"]);
    expect(scoped("MNF sharp money")).toEqual(["Philadelphia Eagles"]);
    expect(scoped("primetime sharp money")).toEqual(["Atlanta Falcons", "Los Angeles Rams", "Philadelphia Eagles"]);
    // A range narrows the nights and slots
    expect(scoped("primetime public betting tonight")).toEqual(["Atlanta Falcons"]);
    expect(scoped("sunday night public betting this weekend")).toEqual(["Los Angeles Rams"]);
    expect(scoped("NFL sunday public betting")).toEqual(["Kansas City Chiefs", "Los Angeles Rams"]);
    expect(listScope("thursday night football odds", now)?.slot).toBe(true);
    expect(listScope("saturday night public betting", now)?.slot).toBe(false);
  });

  it("a named NFL prime-time slot gets its game without a pulse word; nothing else does", () => {
    const pick = (q: string) => pickPulseGames(q, all, {}, now).map((g) => g.away);
    expect(pick("thursday night football odds")).toEqual(["Atlanta Falcons"]);
    expect(pick("SNF spread")).toEqual(["Los Angeles Rams"]);
    expect(pick("monday night football odds")).toEqual(["Philadelphia Eagles"]);
    expect(pick("primetime odds")).toEqual(["Atlanta Falcons", "Los Angeles Rams", "Philadelphia Eagles"]);
    // A splits list holds only games DK posted a split for; these stand-ins have none
    expect(pick("saturday night public betting")).toEqual([]);
    expect(pick("saturday night odds")).toEqual([]);
    expect(pick("late games odds")).toEqual([]);
  });

  it("a school with a qualifier after it is that school's game, never the list", () => {
    const ids = (q: string) => pickPulseGames(q, candidates, {}, now).map((g) => g.gameId);
    expect(ids("public betting on Georgia to cover")).toEqual(["ou-uga"]);
    expect(ids("public betting on Temple to cover")).toEqual(["army-tem"]);
    expect(ids("sharp money on the Georgia side")).toEqual(["ou-uga"]);
    expect(ids("public betting on Stanford to cover")).toEqual([]);
    expect(ids("HBCU public betting")).toEqual([]);
    expect(ids("public betting top 25 games")).toEqual([]);
  });

  it("reads '<school> states' as the State school", () => {
    for (const [q, name] of [
      ["michigan states odds", "Michigan State Spartans"],
      ["iowa states spread", "Iowa State Cyclones"],
      ["oklahoma states line", "Oklahoma State Cowboys"],
      ["ohio states odds", "Ohio State Buckeyes"],
      ["florida states spread", "Florida State Seminoles"],
      ["mississippi states odds", "Mississippi State Bulldogs"],
    ]) {
      expect(scanTeams(q).mentions.map((m) => m.teams.map((t) => t.name)), q).toEqual([[name]]);
    }
  });

  it("drops a team the question rules out, and reads a 'State' typo after a school as that State school (QC round 9)", () => {
    const teams = (q: string) => scanTeams(q).mentions.map((m) => m.teams.map((t) => t.name).join("/"));
    for (const q of [
      "public betting besides Alabama",
      "SEC public betting excluding Alabama",
      "sharp money on anyone but Ohio State",
      "public betting except for the Chiefs",
      "sharp money other than Georgia",
      "not Alabama odds",
      // QC round 10
      "public betting aside from Alabama",
      "apart from the Chiefs, public betting",
      "sharp money without Ohio State",
      "public betting minus Alabama",
      "ignoring Alabama where is the sharp money",
      "public betting not including the Bills",
      "not counting Alabama, who is the public on in the SEC",
      "public betting outside of Georgia",
      "leaving out Alabama public betting SEC",
    ]) {
      expect(teams(q), q).toEqual([]);
    }
    expect(teams("Georgia vs Oklahoma odds, not Alabama")).toEqual(["Georgia Bulldogs", "Oklahoma Sooners"]);
    // QC round 11: every team listed after a ruled-out one, until a word that is no list word
    for (const q of ["public betting besides Alabama or Georgia", "sharp money besides Alabama, Georgia and LSU", "sharp money not counting the Chiefs or Bills", "besides Ohio State, Texas and Georgia"]) {
      expect(teams(q), q).toEqual([]);
    }
    expect(teams("public betting on Alabama and Georgia except LSU")).toEqual(["Alabama Crimson Tide", "Georgia Bulldogs"]);
    expect(teams("public betting besides Alabama, what about Georgia")).toEqual(["Georgia Bulldogs"]);
    // A stadium's name is no team; "field goals" is the team's
    for (const q of ["Ohio Stadium odds", "Notre Dame Stadium odds", "Georgia Dome odds", "Arizona Stadium odds"]) expect(teams(q), q).toEqual([]);
    expect(teams("Georgia field goal odds")).toEqual(["Georgia Bulldogs"]);
    expect(teams("is the public not on Georgia")).toEqual(["Georgia Bulldogs"]);
    expect(teams("Iowa Sate odds")).toEqual(["Iowa State Cyclones"]);
    expect(teams("Michigan Stat odds")).toEqual(["Michigan State Spartans"]);
    expect(teams("Ohio St8 odds")).toEqual(["Ohio State Buckeyes"]);
    expect(teams("Oklahoma Staet spread")).toEqual(["Oklahoma State Cowboys"]);
    // No State school there: no team at all
    expect(teams("Miami Sate odds")).toEqual([]);
    // Real words are not typos, and "Ohio at Michigan" is two schools
    expect(teams("Alabama stats")).toEqual(["Alabama Crimson Tide"]);
    expect(teams("Ohio at Michigan odds")).toEqual(["Ohio Bobcats", "Michigan Wolverines"]);
  });

  it("futures, a past season and a past year get no block; 'Draft Kings' is the sportsbook", () => {
    for (const q of [
      "odds Alabama wins it all",
      "Ohio State odds to win it all",
      "Georgia to win the SEC odds",
      "who is favored to win the SEC",
      "best bet to win the Big 12",
      "Bills to win the division odds",
      "Chiefs to win the AFC odds",
      "Ohio State Big Ten champion odds",
      "Oregon Big Ten title odds",
      "SEC champion odds",
      "Eagles NFC East odds",
      "Georgia SEC",
      // QC round 9: a bare "championship", "division odds", "conference odds"
      "Alabama championship odds",
      "public betting on Alabama for the championship",
      "Chiefs division odds",
      "conference odds Georgia",
      "Georgia odds to make the playoff",
      "Alabama ATS last season",
      "how did Alabama do against the spread last year",
      "What were Alabama's odds in 2020",
      "public betting on the Chiefs last week",
      "Alabama score last Saturday",
      "NFL draft odds",
    ]) {
      expect(gameIntent(q, null, now), q).toBe("no");
    }
    for (const q of [
      "Draft Kings odds Alabama",
      "draft kings public betting tonight",
      "Georgia odds this week after last season",
      "Alabama 2026 odds",
      "give me a sec, public betting on Georgia",
      "SEC public betting",
      "AFC East public betting",
      // A conference beside one team with a betting word is the team's game (the coordinator's round-8 decision)
      "Big Ten public betting Ohio State",
      "SEC sharp money Alabama",
      "sharp money Eagles NFC East",
    ]) {
      expect(gameIntent(q, null, now), q).toBe("yes");
    }
    // A postseason word is an event: the scheduled game it names, none in September (marketPulsePostseason.test.ts)
    for (const q of ["Texas playoff odds", "Chiefs Super Bowl odds", "Alabama national championship odds"]) expect(gameIntent(q, null, now), q).toBe("event");
    // "Kings" in "Draft Kings" is no NBA or NHL team
    expect(leagueFor("Draft Kings line Chiefs Dolphins", now)).toBe("NFL");
    expect(scanTeams("Draft Kings public betting Georgia").mentions.map((m) => m.text)).toEqual(["georgia"]);
  });
});
