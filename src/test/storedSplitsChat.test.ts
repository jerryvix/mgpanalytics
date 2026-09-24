import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

import {
  findSplitsGame,
  formatSplitsAnswer,
  groupSplitGames,
  type StoredLineRow,
  type StoredSplitRow,
} from "@/services/chatbot/storedSplits";

const at = "2026-09-24T06:45:05.581Z";
const now = new Date("2026-09-24T07:05:05.581Z");

// Each side: [market, side, line, price, bets %, money %, open line, open price].
// Bets and money land in betting_splits rows; the numbers in betting_lines rows.
type SideSpec = [string, string, number | null, number, number, number, number | null, number | null];
const linesByGame = new Map<string, StoredLineRow[]>();
function game(sport: string, gameId: string, matchup: string, away: string, home: string, start: string, sides: SideSpec[]): StoredSplitRow[] {
  linesByGame.set(
    gameId,
    sides.map(([market, side, line, price, , , openLine, openPrice]) => ({
      sport,
      game_id: gameId,
      market,
      side,
      line,
      price,
      open_line: openLine,
      open_price: openPrice,
      captured_at: at,
    })),
  );
  return sides.map(([market, side, , , bets, handle]) => ({
    sport,
    game_id: gameId,
    source_matchup: matchup,
    away_team: away,
    home_team: home,
    event_start: start,
    market,
    side,
    bets_pct: bets,
    handle_pct: handle,
    captured_at: at,
  }));
}

// Real captures (Sep 24 2026) for the headline game, trimmed stand-ins elsewhere
const rows: StoredSplitRow[] = [
  ...game("NCAAF", "ou-uga", "Oklahoma @ Georgia", "Oklahoma Sooners", "Georgia Bulldogs", "2026-09-26T19:30:00Z", [
    ["spread", "away", 14, -110, 32, 65, 10, -110],
    ["spread", "home", -14, -110, 68, 35, -10, -110],
    ["total", "over", 44.5, -110, 79, 12, 52.5, -110],
    ["total", "under", 44.5, -110, 21, 88, 52.5, -110],
    ["moneyline", "away", null, 440, 3, 13, null, 310],
    ["moneyline", "home", null, -600, 97, 87, null, -395],
  ]),
  ...game("NCAAF", "niu-gsu", "Northern Illinois @ Georgia State", "Northern Illinois Huskies", "Georgia State Panthers", "2026-09-26T18:00:00Z", [
    ["spread", "away", 10.5, -112, 40, 24, 9.5, -110],
    ["spread", "home", -10.5, -108, 60, 76, -9.5, -110],
  ]),
  ...game("NCAAF", "cmu-mia", "Central Michigan @ Miami FL", "Central Michigan Chippewas", "Miami Hurricanes", "2026-09-26T22:30:00Z", [
    ["spread", "away", 41.5, -108, 17, 20, 40.5, -110],
    ["spread", "home", -41.5, -112, 83, 80, -40.5, -110],
  ]),
  ...game("NCAAF", "uconn-moh", "UConn @ Miami OH", "UConn Huskies", "Miami (OH) RedHawks", "2026-09-26T19:30:00Z", [
    ["spread", "away", 3.5, -112, 67, 98, 3.5, -110],
    ["spread", "home", -3.5, -108, 33, 2, -3.5, -110],
  ]),
  ...game("NFL", "1392253", "KC Chiefs @ MIA Dolphins", "Kansas City Chiefs", "Miami Dolphins", "2026-09-27T17:00:00Z", [
    ["spread", "away", -10.5, -115, 80, 73, null, null],
    ["spread", "home", 10.5, -105, 20, 27, null, null],
  ]),
];
const games = groupSplitGames(rows);
const find = (q: string) => findSplitsGame(q, games, now)?.gameId ?? null;
const answer = (gameId: string) => {
  const g = games.find((x) => x.gameId === gameId)!;
  return formatSplitsAnswer({ ...g, lines: linesByGame.get(gameId) ?? [] }, now);
};

describe("findSplitsGame", () => {
  it("finds the game from either team, DK's short name or ours", () => {
    expect(find("public betting Oklahoma vs Georgia")).toBe("ou-uga");
    // "Sooners" is Oklahoma's alone; "Bulldogs" is many schools' and names nobody by itself
    expect(find("where is the sharp money on the Sooners Bulldogs game")).toBe("ou-uga");
    expect(find("public betting bulldogs")).toBeNull();
    expect(find("public betting georgia bulldogs")).toBe("ou-uga");
    expect(find("sharp money on Georgia State")).toBe("niu-gsu"); // longer name beats "Georgia"
    // "Miami" alone is the Hurricanes, the RedHawks, the Dolphins or the Marlins: no guess
    expect(find("public betting Miami")).toBeNull();
    expect(find("public betting Miami FL")).toBe("cmu-mia"); // DK "Miami FL"
    expect(find("public betting Miami OH")).toBe("uconn-moh");
    expect(find("sharp money Dolphins")).toBe("1392253");
    expect(find("nfl public betting chiefs")).toBe("1392253");
  });

  it("returns null (web search fallback) when no stored game is named", () => {
    expect(find("public betting Alabama")).toBeNull();
    expect(find("public betting")).toBeNull();
  });

  it("never lends a stored school's split to a different school that contains its name", () => {
    // "Georgia" is stored (vs Oklahoma); these are other schools
    expect(find("public betting Georgia Tech")).toBeNull();
    expect(find("sharp money on Georgia Southern")).toBeNull();
    expect(find("public betting South Georgia")).toBeNull();
    // ...while the stored school itself still resolves in a longer sentence
    expect(find("is the public on Georgia this week")).toBe("ou-uga");
  });

  it("maps DK's labels onto our sides even when DK lists the game the other way round", () => {
    const swapped = groupSplitGames(
      game("NCAAF", "fla-uga", "Georgia @ Florida", "Florida Gators", "Georgia Bulldogs", "2026-10-31T19:30:00Z", [
        ["spread", "away", 6.5, -110, 30, 40, null, null],
        ["spread", "home", -6.5, -110, 70, 60, null, null],
      ]),
    )[0];
    expect(swapped.labels.home).toContain("georgia");
    expect(swapped.labels.away).toContain("florida");
  });
});

describe("formatSplitsAnswer", () => {
  it("answers with DK's numbers and the same markers Market Pulse shows", () => {
    const text = answer("ou-uga");
    expect(text).toContain("**Oklahoma Sooners @ Georgia Bulldogs** · DraftKings betting splits");
    expect(text).toContain("Sat 3:30 PM ET · line updated 20m ago · split 20m ago");
    expect(text).toContain("Oklahoma Sooners +14 (-110): 32% of bets, 65% of money · sharp money");
    expect(text).toContain("Georgia Bulldogs -14 (-110): 68% of bets, 35% of money · public side");
    expect(text).toContain("Over 44.5 (-110): 79% of bets, 12% of money · public side");
    expect(text).toContain("Under 44.5 (-110): 21% of bets, 88% of money · sharp money, reverse line move");
    expect(text).toContain("Open +10 → Now +14 (Oklahoma Sooners)");
    expect(text).toContain("Open 52.5 → Now 44.5");
    expect(text).toContain("Open +310 / -395 → Now +440 / -600 (away / home)");
    expect(text.includes(String.fromCharCode(0x2014))).toBe(false); // house rule: no em dashes
  });

  it("leaves the open line out when DK's open is unknown (NFL)", () => {
    const text = answer("1392253");
    expect(text).toContain("Kansas City Chiefs -10.5 (-115): 80% of bets, 73% of money · public side");
    expect(text).not.toContain("Open ");
  });
});
