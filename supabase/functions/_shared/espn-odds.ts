import { espnFetch } from "./espn-fetch.ts";
// Shared ESPN odds fetcher. ESPN's core API exposes per-event sportsbook
// lines (DraftKings) with BOTH opening and current values, free and keyless.
// This replaced The Odds API (paid, key died Jul 2026) as MGP's game-odds
// source per owner decision Aug 7 2026. Coverage: one book (DraftKings), so
// multi-book consensus features degrade gracefully to single-book values.

export type EspnOddsLeague = "college-football" | "nfl" | "mlb";

const LEAGUE_PATH: Record<EspnOddsLeague, string> = {
  "college-football": "sports/football/leagues/college-football",
  nfl: "sports/football/leagues/nfl",
  mlb: "sports/baseball/leagues/mlb",
};

export interface EspnEventOdds {
  // Normalized sportsbook slug, e.g. "draftkings" (matches UI SPORTSBOOKS)
  sportsbook: string;
  // Home-relative spread (TCU -7.5 at home => -7.5)
  spreadHome: number | null;
  spreadHomeOdds: number | null;
  spreadAwayOdds: number | null;
  moneylineHome: number | null;
  moneylineAway: number | null;
  totalValue: number | null;
  totalOverOdds: number | null;
  totalUnderOdds: number | null;
  // Opening values where ESPN provides them (spread/ML per side)
  openSpreadHome: number | null;
  openMoneylineHome: number | null;
  openMoneylineAway: number | null;
  openTotal: number | null;
  // Opening PRICES on the spread and total (sync-betting-splits uses them to
  // tell a price-only move from no move when the number itself held)
  openSpreadHomeOdds: number | null;
  openSpreadAwayOdds: number | null;
  openTotalOverOdds: number | null;
  openTotalUnderOdds: number | null;
}

// ESPN prices arrive as numbers ("moneyLine": -310) or american strings
// ("+250", "EVEN"). Normalize to a signed integer, EVEN => +100.
function parseAmerican(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    if (s === "EVEN" || s === "EV" || s === "PK") return 100;
    const n = parseFloat(s.replace("+", ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parsePoint(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace("+", ""));
  return Number.isFinite(n) ? n : null;
}

function slugifyProvider(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface EspnSideOdds {
  moneyLine?: unknown;
  spreadOdds?: unknown;
  open?: {
    pointSpread?: { american?: unknown };
    spread?: { american?: unknown };
    moneyLine?: { american?: unknown };
  };
  current?: {
    pointSpread?: { american?: unknown };
    spread?: { american?: unknown };
    moneyLine?: { american?: unknown };
  };
}

interface EspnOddsItem {
  provider?: { id?: string; name?: string; priority?: number };
  spread?: unknown;
  overUnder?: unknown;
  overOdds?: unknown;
  underOdds?: unknown;
  open?: { total?: { american?: unknown }; over?: { american?: unknown }; under?: { american?: unknown } };
  homeTeamOdds?: EspnSideOdds;
  awayTeamOdds?: EspnSideOdds;
}

function normalizeItem(item: EspnOddsItem): EspnEventOdds {
  const home = item.homeTeamOdds || {};
  const away = item.awayTeamOdds || {};

  // Prefer the explicit current pointSpread; fall back to top-level spread
  // (also home-relative in ESPN's schema)
  const spreadHome =
    parsePoint(home.current?.pointSpread?.american) ?? parsePoint(item.spread);

  return {
    sportsbook: slugifyProvider(item.provider?.name || "unknown"),
    spreadHome,
    // Football items carry the spread price as top-level spreadOdds; MLB run
    // line items omit it (every MLB card read "N/A") and keep the price only at
    // current.spread.american. The two agree wherever both exist.
    spreadHomeOdds: parseAmerican(home.spreadOdds) ?? parseAmerican(home.current?.spread?.american),
    spreadAwayOdds: parseAmerican(away.spreadOdds) ?? parseAmerican(away.current?.spread?.american),
    moneylineHome:
      parseAmerican(home.moneyLine) ??
      parseAmerican(home.current?.moneyLine?.american),
    moneylineAway:
      parseAmerican(away.moneyLine) ??
      parseAmerican(away.current?.moneyLine?.american),
    totalValue: parsePoint(item.overUnder),
    totalOverOdds: parseAmerican(item.overOdds),
    totalUnderOdds: parseAmerican(item.underOdds),
    openSpreadHome: parsePoint(home.open?.pointSpread?.american),
    openMoneylineHome: parseAmerican(home.open?.moneyLine?.american),
    openMoneylineAway: parseAmerican(away.open?.moneyLine?.american),
    openTotal: parsePoint(item.open?.total?.american),
    openSpreadHomeOdds: parseAmerican(home.open?.spread?.american),
    openSpreadAwayOdds: parseAmerican(away.open?.spread?.american),
    openTotalOverOdds: parseAmerican(item.open?.over?.american),
    openTotalUnderOdds: parseAmerican(item.open?.under?.american),
  };
}

// Fetch odds for one ESPN event. Returns the DraftKings item when present,
// otherwise the highest-priority provider, or null when no lines are posted
// yet (normal for FCS mismatches and far-out games).
export async function fetchEspnEventOdds(
  league: EspnOddsLeague,
  eventId: string,
): Promise<EspnEventOdds | null> {
  const url = `https://sports.core.api.espn.com/v2/${LEAGUE_PATH[league]}/events/${eventId}/competitions/${eventId}/odds`;
  const res = await espnFetch(url);
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const items: EspnOddsItem[] = data?.items || [];
  if (items.length === 0) return null;

  const pick =
    items.find((i) => slugifyProvider(i.provider?.name || "") === "draftkings") ||
    items.find((i) => i.provider?.priority === 1) ||
    items[0];

  const normalized = normalizeItem(pick);
  // An item with no usable numbers is as good as no odds
  const hasAny =
    normalized.spreadHome !== null ||
    normalized.moneylineHome !== null ||
    normalized.totalValue !== null;
  return hasAny ? normalized : null;
}

// Fetch odds for many events with bounded concurrency. Returns a map of
// eventId to odds; events without posted lines are simply absent.
export async function fetchEspnOddsBatch(
  league: EspnOddsLeague,
  eventIds: string[],
  concurrency = 5,
): Promise<Map<string, EspnEventOdds>> {
  const results = new Map<string, EspnEventOdds>();
  let cursor = 0;

  async function worker() {
    while (cursor < eventIds.length) {
      const id = eventIds[cursor++];
      try {
        const odds = await fetchEspnEventOdds(league, id);
        if (odds) results.set(id, odds);
      } catch (err) {
        console.error(`[espn-odds] event ${id} failed:`, err);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, eventIds.length) }, worker),
  );
  return results;
}
