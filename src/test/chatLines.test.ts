import { describe, it, expect, vi, beforeEach } from "vitest";

// Market Pulse QC round 2, Sep 24 2026: every chat odds path read the daily
// odds tables (ncaaf_odds at 08:18 differed from the line the app showed in
// 6 of 71 games), and the stored-splits chat answered nothing for a game DK
// posted no split for, so "sharp money Arizona Washington State" fell to a
// web search. Every chat path now quotes the app's one DraftKings line.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const reads: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];

// A tiny PostgREST stand-in: eq(), in() and gte()/lte() filter, the rest pass through
function query(table: string): unknown {
  const filters: Array<[string, string, unknown]> = [];
  let range: [number, number] | null = null;
  const special: Record<string, unknown> = {};
  const q: unknown = new Proxy(special, { get: (t, prop) => (prop in t ? t[prop as string] : () => q) });
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
  special.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    reads.push({ table, filters });
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
    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  };
  return q;
}
const client = { from: (t: string) => query(t) };

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => query(t) } }));

import { fmtAmerican, overlayDkOdds, withDkLines, type AnyOddsRow, type LineRowLike } from "../../supabase/functions/_shared/dk-line";
import { answerFromStoredSplits, findSplitsGame, formatSplitsAnswer, lineOnlyGames } from "@/services/chatbot/storedSplits";

const LINES_AT = "2026-09-24T09:31:03.943+00:00";
const line = (gameId: string, market: string, side: string, value: number | null, price: number, openLine: number | null, openPrice: number | null) => ({
  source: "draftkings",
  sport: "NCAAF",
  game_id: gameId,
  market,
  side,
  line: value,
  price,
  open_line: openLine,
  open_price: openPrice,
  captured_at: LINES_AT,
});
const AZ = "df988ca5-ab79-400c-9f1b-d576d7708042";
const NIU = "960c57d3-b3f7-4b3e-b74d-18035ac5ea8e";
const azLines = [
  line(AZ, "spread", "away", -10, -115, -13.5, -110),
  line(AZ, "spread", "home", 10, -105, 13.5, -110),
  line(AZ, "total", "over", 48.5, -110, 48.5, -110),
  line(AZ, "total", "under", 48.5, -110, 48.5, -110),
  line(AZ, "moneyline", "away", null, -410, null, -575),
  line(AZ, "moneyline", "home", null, 320, null, 425),
];
const niuLines = [line(NIU, "moneyline", "away", null, 320, null, 300), line(NIU, "moneyline", "home", null, -410, null, -380)];
// The daily NCAAF games sync wrote these at 08:18, before the 09:31 lines
const odds08 = (gameId: string, away: number, home: number): AnyOddsRow => ({
  game_id: gameId,
  sportsbook: "draftkings",
  spread_value: 10,
  spread_odds: -105,
  moneyline_away: away,
  moneyline_home: home,
  total_value: 48.5,
  total_over_odds: -110,
  total_under_odds: -110,
  updated_at: "2026-09-24T08:18:24.570778+00:00",
});

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  reads.length = 0;
});

describe("chat odds rows (gemini-chat, analyst-query)", () => {
  it("quotes the app's DraftKings number, keeps other books, and adds a game only the line store has", () => {
    const stored = new Map<string, LineRowLike[]>([
      [NIU, niuLines],
      [AZ, azLines],
    ]);
    const rows = overlayDkOdds(
      [odds08(NIU, 295, -375), { ...odds08(NIU, 300, -380), sportsbook: "fanduel", games: { id: NIU } }],
      stored,
      [NIU, AZ],
    );
    const dk = rows.find((r) => r.game_id === NIU && r.sportsbook === "draftkings")!;
    expect([dk.moneyline_away, dk.moneyline_home]).toEqual([320, -410]); // not the 08:18 +295 / -375
    // Its spread and total are still the 08:18 row's: "updated" names the oldest number quoted
    expect(dk.updated_at).toBe("2026-09-24T08:18:24.570778+00:00");
    expect(rows.find((r) => r.sportsbook === "fanduel")).toMatchObject({ moneyline_away: 300, games: { id: NIU } });
    const az = rows.find((r) => r.game_id === AZ)!;
    expect(az).toMatchObject({ sportsbook: "draftkings", moneyline_away: -410, moneyline_home: 320, spread_value: 10, spread_away_odds: -115 });
  });

  it("reads betting_lines by our game ids for NCAAF and NFL only", async () => {
    db.betting_lines = azLines;
    const rows = await withDkLines(client, "NCAAF", [odds08(AZ, -395, 310)], [AZ]);
    expect([rows[0].moneyline_away, rows[0].moneyline_home]).toEqual([-410, 320]);
    expect(reads[0]).toMatchObject({ table: "betting_lines" });
    expect(reads[0].filters).toContainEqual(["eq", "sport", "NCAAF"]);
    reads.length = 0;
    const nba = [odds08("nba-1", -150, 130)];
    expect(await withDkLines(client, "NBA", nba, ["nba-1"])).toBe(nba);
    expect(reads).toEqual([]);
  });

  it("writes prices with their sign and even money as +100", () => {
    expect([fmtAmerican(245), fmtAmerican(-305), fmtAmerican(-100), fmtAmerican(100), fmtAmerican(null, "n/a")]).toEqual([
      "+245",
      "-305",
      "+100",
      "+100",
      "n/a",
    ]);
  });
});

describe("stored-splits chat without a DK split", () => {
  const games = lineOnlyGames("NCAAF", [
    { id: AZ, date: "2026-09-26T23:30:00Z", status: "STATUS_SCHEDULED", home_team_name: "Washington State Cougars", visitor_team_name: "Arizona Wildcats" },
    { id: "g-asu", date: "2026-09-26T19:00:00Z", status: "STATUS_SCHEDULED", home_team_name: "Arizona State Sun Devils", visitor_team_name: "Utah Utes" },
    { id: "g-final", date: "2026-09-24T02:00:00Z", status: "STATUS_FINAL", home_team_name: "Washington Huskies", visitor_team_name: "Arizona Wildcats" },
  ]);
  const now = new Date("2026-09-24T10:30:00Z");

  it("finds the game from the question, never a finished one or a longer school's", () => {
    expect(games.map((g) => g.gameId)).toEqual([AZ, "g-asu"]);
    expect(findSplitsGame("sharp money Arizona Washington State", games, now)?.gameId).toBe(AZ);
    expect(findSplitsGame("public betting Arizona State", games, now)?.gameId).toBe("g-asu");
  });

  it("answers with DraftKings' line and says plainly there is no split to read", () => {
    const text = formatSplitsAnswer({ ...games[0], lines: azLines, odds: odds08(AZ, -395, 310) as never }, now);
    expect(text).toContain("**Arizona Wildcats @ Washington State Cougars** · DraftKings line");
    expect(text).toContain("line updated 58m ago");
    expect(text).toContain("DraftKings hasn't posted a public betting split for this game");
    expect(text).toContain("Arizona Wildcats -410");
    expect(text).toContain("Washington State Cougars +320");
    expect(text).toContain("Arizona Wildcats -10 (-115)");
    expect(text).toContain("Open -575 / +425 → Now -410 / +320 (away / home)");
    expect(text).toContain("Open 48.5, unchanged");
    expect(text).not.toMatch(/% of bets|Sharp money =|\+310|-395/);
    expect(text.includes(String.fromCharCode(0x2014))).toBe(false);
  });

  it("answers end to end from stored data instead of falling to a web search", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      Object.assign(db, {
        betting_splits: [],
        ncaaf_games: [
          { id: AZ, date: "2026-09-26T23:30:00Z", status: "STATUS_SCHEDULED", home_team_name: "Washington State Cougars", visitor_team_name: "Arizona Wildcats", time_tbd: false },
        ],
        games: [],
        betting_lines: azLines,
        ncaaf_odds: [odds08(AZ, -395, 310)],
      });
      const text = await answerFromStoredSplits("sharp money Arizona Washington State", now);
      expect(text).toContain("Open -575 / +425 → Now -410 / +320 (away / home)");
      expect(text).not.toContain("-395");
      // A game with nothing stored still goes to search
      db.betting_lines = [];
      db.ncaaf_odds = [];
      expect(await answerFromStoredSplits("sharp money Arizona Washington State", now)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
