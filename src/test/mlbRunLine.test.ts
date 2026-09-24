import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchEspnEventOdds } from "../../supabase/functions/_shared/espn-odds";
import { isPostedRunLine, isPostedTotal, postedMlbOdds } from "@/lib/mlbRunLine";
import { historyOpens } from "@/hooks/useMarketPulse";

// Final review, Sep 24 2026: Rockies @ White Sox read "RUN LINE: Sox +0 (N/A)".
// The 21:00 UTC sync caught ESPN's DraftKings item before the run line was
// posted, and ESPN fills that gap with spread 0 and no price (32 August games
// were first captured the same way, some with a 0 @ 0 total). MLB now keeps a
// run line only at +/-1.5 with a price; football, where a 0 spread is a real
// pick'em, parses exactly as before.

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(() => vi.unstubAllGlobals());

const stubItem = (item: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [item] }), { status: 200 })));
const am = (american: string) => ({ american });

describe("ESPN MLB odds: only what DraftKings has posted", () => {
  it("stores no run line while DraftKings hasn't posted one (White Sox, 21:00 UTC)", async () => {
    // What the 21:00 sync stored: spread 0, no run-line price, ML and total up
    stubItem({
      provider: { name: "DraftKings", priority: 1 },
      spread: 0,
      overUnder: 8.5,
      overOdds: 104,
      underOdds: -126,
      open: { total: am("8.5"), over: am("-110"), under: am("-110") },
      homeTeamOdds: { moneyLine: -224, open: { moneyLine: am("-222") } },
      awayTeamOdds: { moneyLine: 183, open: { moneyLine: am("+181") } },
    });
    const odds = await fetchEspnEventOdds("mlb", "401817080");
    expect(odds).toMatchObject({
      spreadHome: null,
      spreadHomeOdds: null,
      spreadAwayOdds: null,
      openSpreadHome: null,
      moneylineHome: -224,
      moneylineAway: 183,
      totalValue: 8.5,
      totalOverOdds: 104,
      totalUnderOdds: -126,
    });
  });

  it("keeps the posted run line and total exactly (the same game's item at 22:38 UTC)", async () => {
    stubItem({
      provider: { name: "DraftKings", priority: 1 },
      spread: -1.5,
      overUnder: 8,
      overOdds: -113,
      underOdds: -106,
      open: { total: am("8.5"), over: am("-110"), under: am("-110") },
      homeTeamOdds: {
        moneyLine: -224,
        open: { pointSpread: am("-1.5"), spread: am("+104"), moneyLine: am("-222") },
        current: { pointSpread: am("-1.5"), spread: am("+104"), moneyLine: am("-224") },
      },
      awayTeamOdds: {
        moneyLine: 182,
        open: { pointSpread: am("+1.5"), spread: am("-126"), moneyLine: am("+181") },
        current: { pointSpread: am("+1.5"), spread: am("-126"), moneyLine: am("+182") },
      },
    });
    expect(await fetchEspnEventOdds("mlb", "401817080")).toEqual({
      sportsbook: "draftkings",
      spreadHome: -1.5,
      spreadHomeOdds: 104,
      spreadAwayOdds: -126,
      moneylineHome: -224,
      moneylineAway: 182,
      totalValue: 8,
      totalOverOdds: -113,
      totalUnderOdds: -106,
      openSpreadHome: -1.5,
      openMoneylineHome: -222,
      openMoneylineAway: 181,
      openTotal: 8.5,
      openSpreadHomeOdds: 104,
      openSpreadAwayOdds: -126,
      openTotalOverOdds: -110,
      openTotalUnderOdds: -110,
    });
  });

  it("drops a run line other than +/-1.5, or one without a price", async () => {
    const item = (spread: number, price?: string) => ({
      provider: { name: "DraftKings" },
      spread,
      homeTeamOdds: { moneyLine: -150, current: { pointSpread: am(String(spread)), ...(price ? { spread: am(price) } : {}) } },
      awayTeamOdds: { moneyLine: 130 },
    });
    stubItem(item(-2.5, "+160"));
    expect((await fetchEspnEventOdds("mlb", "1"))?.spreadHome).toBeNull();
    stubItem(item(-1.5));
    expect(await fetchEspnEventOdds("mlb", "1")).toMatchObject({ spreadHome: null, spreadHomeOdds: null, moneylineHome: -150 });
    stubItem(item(1.5, "-190"));
    expect(await fetchEspnEventOdds("mlb", "1")).toMatchObject({ spreadHome: 1.5, spreadHomeOdds: -190 });
  });

  it("reads a 0 @ 0 total as no total, and an item with nothing posted as no odds", async () => {
    stubItem({ provider: { name: "DraftKings" }, spread: 0, overUnder: 0, overOdds: 0, underOdds: 0, homeTeamOdds: { moneyLine: -183 }, awayTeamOdds: { moneyLine: 150 } });
    expect(await fetchEspnEventOdds("mlb", "401816527")).toMatchObject({
      spreadHome: null,
      totalValue: null,
      totalOverOdds: null,
      totalUnderOdds: null,
      moneylineHome: -183,
    });
    stubItem({ provider: { name: "DraftKings" }, spread: 0, overUnder: 0, homeTeamOdds: {}, awayTeamOdds: {} });
    expect(await fetchEspnEventOdds("mlb", "1")).toBeNull();
  });
});

describe("ESPN football odds are untouched", () => {
  // Real DraftKings items (trimmed to what the parser reads), Sep 24 2026
  const nfl = {
    provider: { name: "Draft Kings", priority: 1 },
    spread: -4.5,
    overUnder: 43.5,
    overOdds: -108,
    underOdds: -112,
    open: { total: am("46.5"), over: am("-110"), under: am("-110") },
    homeTeamOdds: {
      moneyLine: -238,
      spreadOdds: -112,
      open: { pointSpread: am("-7.5"), spread: am("-110"), moneyLine: am("-360") },
      current: { pointSpread: am("-4.5"), spread: am("-112"), moneyLine: am("-238") },
    },
    awayTeamOdds: {
      moneyLine: 195,
      spreadOdds: -108,
      open: { pointSpread: am("+7.5"), spread: am("-110"), moneyLine: am("+285") },
      current: { pointSpread: am("+4.5"), spread: am("-108"), moneyLine: am("+195") },
    },
  };

  it("parses a real NFL item field for field", async () => {
    stubItem(nfl);
    expect(await fetchEspnEventOdds("nfl", "401872948")).toEqual({
      sportsbook: "draftkings",
      spreadHome: -4.5,
      spreadHomeOdds: -112,
      spreadAwayOdds: -108,
      moneylineHome: -238,
      moneylineAway: 195,
      totalValue: 43.5,
      totalOverOdds: -108,
      totalUnderOdds: -112,
      openSpreadHome: -7.5,
      openMoneylineHome: -360,
      openMoneylineAway: 285,
      openTotal: 46.5,
      openSpreadHomeOdds: -110,
      openSpreadAwayOdds: -110,
      openTotalOverOdds: -110,
      openTotalUnderOdds: -110,
    });
  });

  it("keeps a college pick'em at 0, spreads off 1.5 and even a 0 @ 0 total, as ESPN sends them", async () => {
    stubItem({
      provider: { name: "Draft Kings", priority: 1 },
      spread: 0,
      overUnder: 0,
      overOdds: 0,
      underOdds: 0,
      homeTeamOdds: { moneyLine: -110, spreadOdds: -110, current: { pointSpread: am("PK") } },
      awayTeamOdds: { moneyLine: -110, spreadOdds: -110 },
    });
    expect(await fetchEspnEventOdds("college-football", "401856696")).toMatchObject({
      spreadHome: 0,
      spreadHomeOdds: -110,
      spreadAwayOdds: -110,
      totalValue: 0,
      totalOverOdds: 0,
      totalUnderOdds: 0,
    });
    stubItem({ ...nfl, spread: -12.5, homeTeamOdds: { ...nfl.homeTeamOdds, current: { pointSpread: am("-12.5") }, spreadOdds: undefined } });
    expect(await fetchEspnEventOdds("college-football", "401856696")).toMatchObject({ spreadHome: -12.5, spreadHomeOdds: null });
  });
});

describe("postedMlbOdds (the app's MLB surfaces)", () => {
  const stored = {
    game_id: "e6016646-c4bb-4890-9ca0-fe9bc8b5e09b",
    sportsbook: "draftkings",
    spread_value: 0,
    spread_odds: null,
    moneyline_home: -224,
    moneyline_away: 183,
    total_value: 8.5,
    total_over_odds: 104,
    total_under_odds: -126,
  };

  it("blanks the stored White Sox run line and keeps the rest", () => {
    expect(postedMlbOdds(stored)).toEqual({ ...stored, spread_value: null, spread_odds: null });
  });

  it("returns a posted row untouched and blanks a 0 total", () => {
    const good = { ...stored, spread_value: -1.5, spread_odds: 104 };
    expect(postedMlbOdds(good)).toBe(good);
    expect(postedMlbOdds({ ...good, total_value: 0, total_over_odds: 0, total_under_odds: 0 })).toMatchObject({
      spread_value: -1.5,
      total_value: null,
      total_over_odds: null,
      total_under_odds: null,
    });
  });

  it("knows a posted run line and total", () => {
    expect(isPostedRunLine(-1.5, 104)).toBe(true);
    expect(isPostedRunLine("1.5", -126)).toBe(true);
    expect(isPostedRunLine(0, null)).toBe(false);
    expect(isPostedRunLine(-1.5, null)).toBe(false);
    expect(isPostedRunLine(-1.5, 0)).toBe(false);
    expect(isPostedRunLine(-2.5, 150)).toBe(false);
    expect(isPostedTotal(8.5)).toBe(true);
    expect(isPostedTotal(0)).toBe(false);
    expect(isPostedTotal(null)).toBe(false);
  });
});

describe("historyOpens: an MLB run-line open from before the line was posted", () => {
  const row = (team: string, opening_line: number) => ({
    game_id: "espn_mlb_401816558",
    bookmaker: "draftkings",
    odds_type: "spread",
    team,
    opening_line,
    timestamp: "2026-08-16T05:00:00Z",
  });

  it("is no open for MLB (it read 'Open PK'), but a football pick'em open stays", () => {
    const rows = [row("San Francisco Giants", 0), row("Colorado Rockies", 0)];
    expect(historyOpens(rows, "San Francisco Giants", "Colorado Rockies", "MLB")).toEqual([]);
    expect(historyOpens(rows, "San Francisco Giants", "Colorado Rockies", "NFL")).toHaveLength(2);
    const posted = [row("San Francisco Giants", -1.5), row("Colorado Rockies", 1.5)];
    expect(historyOpens(posted, "San Francisco Giants", "Colorado Rockies", "MLB")).toEqual([
      { market: "spread", side: "home", open_line: -1.5, open_price: null },
      { market: "spread", side: "away", open_line: 1.5, open_price: null },
    ]);
  });
});
