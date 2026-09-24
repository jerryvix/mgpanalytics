// Turns one matched DK splits event into betting_splits rows. Pure, covered by
// src/test/bettingSplitsMatch.test.ts.
import type { DkSplitsEvent, SplitMarket, SplitSide } from "./parse.ts";

export interface SplitRow {
  sport: string;
  game_id: string;
  source: "draftkings";
  source_event_id: string;
  source_matchup: string;
  away_team: string;
  home_team: string;
  event_start: string;
  market: SplitMarket;
  side: SplitSide;
  line: number | null;
  price: number | null;
  bets_pct: number;
  handle_pct: number;
  open_line: number | null;
  open_price: number | null;
  captured_at: string;
  /** DK's page freshness for these numbers (freshness.ts), not our fetch time */
  source_as_of: string;
}

/**
 * DraftKings opening numbers in OUR game's orientation (ESPN relays DK open
 * values per event, and our NCAAF rows are ESPN events, so no flip needed).
 * Field names mirror EspnEventOdds in _shared/espn-odds.ts.
 */
export interface OpeningLines {
  openSpreadHome: number | null;
  openSpreadHomeOdds: number | null;
  openSpreadAwayOdds: number | null;
  openMoneylineHome: number | null;
  openMoneylineAway: number | null;
  openTotal: number | null;
  openTotalOverOdds: number | null;
  openTotalUnderOdds: number | null;
}

export interface MatchedGame {
  game: { id: string | number; home_team_name: string; visitor_team_name: string };
  /** DK lists the teams the other way round from our row */
  swapped: boolean;
}

const FLIP: Record<SplitSide, SplitSide> = { away: "home", home: "away", over: "over", under: "under" };

function openFor(market: SplitMarket, side: SplitSide, o: OpeningLines | null): { line: number | null; price: number | null } {
  if (!o) return { line: null, price: null };
  if (market === "moneyline") {
    return { line: null, price: side === "home" ? o.openMoneylineHome : o.openMoneylineAway };
  }
  if (market === "spread") {
    if (side === "home") return { line: o.openSpreadHome, price: o.openSpreadHomeOdds };
    return { line: o.openSpreadHome === null ? null : -o.openSpreadHome, price: o.openSpreadAwayOdds };
  }
  return { line: o.openTotal, price: side === "over" ? o.openTotalOverOdds : o.openTotalUnderOdds };
}

export function buildSplitRows(
  sport: string,
  event: DkSplitsEvent & { kickoffUtc: Date },
  match: MatchedGame,
  opens: OpeningLines | null,
  capturedAt: string,
  /** DK's page freshness; this fetch's time when the page came straight from DK */
  sourceAsOf: string = capturedAt,
): SplitRow[] {
  const rows: SplitRow[] = [];
  for (const market of ["spread", "total", "moneyline"] as SplitMarket[]) {
    const outcomes = event.markets[market];
    if (!outcomes) continue;
    for (const o of outcomes) {
      // Sides are stored relative to OUR row; a swapped listing flips team sides
      const side = match.swapped ? FLIP[o.side] : o.side;
      const open = openFor(market, side, opens);
      rows.push({
        sport,
        game_id: String(match.game.id),
        source: "draftkings",
        source_event_id: event.eventId,
        source_matchup: `${event.away} @ ${event.home}`,
        away_team: match.game.visitor_team_name,
        home_team: match.game.home_team_name,
        event_start: event.kickoffUtc.toISOString(),
        market,
        side,
        line: o.line,
        price: o.price,
        bets_pct: o.betsPct,
        handle_pct: o.handlePct,
        open_line: open.line,
        open_price: open.price,
        captured_at: capturedAt,
        source_as_of: sourceAsOf,
      });
    }
  }
  return rows;
}

/**
 * DraftKings' current and opening quote for one event as ESPN's core odds
 * API relays it (EspnEventOdds in _shared/espn-odds.ts, declared here
 * structurally so this module stays pure). Home-relative.
 */
export interface DkEventQuote extends OpeningLines {
  spreadHome: number | null;
  spreadHomeOdds: number | null;
  spreadAwayOdds: number | null;
  moneylineHome: number | null;
  moneylineAway: number | null;
  totalValue: number | null;
  totalOverOdds: number | null;
  totalUnderOdds: number | null;
}

/** ESPN's quote in OUR game's orientation (swapped = ESPN lists our home team as away). */
export function orientQuote(q: DkEventQuote, swapped: boolean): DkEventQuote {
  if (!swapped) return q;
  const neg = (v: number | null) => (v === null ? null : -v);
  return {
    ...q,
    spreadHome: neg(q.spreadHome),
    spreadHomeOdds: q.spreadAwayOdds,
    spreadAwayOdds: q.spreadHomeOdds,
    moneylineHome: q.moneylineAway,
    moneylineAway: q.moneylineHome,
    openSpreadHome: neg(q.openSpreadHome),
    openSpreadHomeOdds: q.openSpreadAwayOdds,
    openSpreadAwayOdds: q.openSpreadHomeOdds,
    openMoneylineHome: q.openMoneylineAway,
    openMoneylineAway: q.openMoneylineHome,
  };
}

export interface LineRow {
  sport: string;
  game_id: string;
  source: "draftkings";
  feed: "espn";
  feed_event_id: string;
  market: SplitMarket;
  side: SplitSide;
  line: number | null;
  price: number | null;
  open_line: number | null;
  open_price: number | null;
  captured_at: string;
}

/** betting_lines rows (current + open, both prices) from a quote already in our orientation. */
export function buildLineRows(
  sport: string,
  gameId: string,
  eventId: string,
  q: DkEventQuote,
  capturedAt: string,
): LineRow[] {
  const rows: LineRow[] = [];
  const add = (
    market: SplitMarket,
    side: SplitSide,
    line: number | null,
    price: number | null,
    openLine: number | null,
    openPrice: number | null,
  ) =>
    rows.push({
      sport,
      game_id: gameId,
      source: "draftkings",
      feed: "espn",
      feed_event_id: eventId,
      market,
      side,
      line,
      price,
      open_line: openLine,
      open_price: openPrice,
      captured_at: capturedAt,
    });
  const neg = (v: number | null) => (v === null ? null : v === 0 ? 0 : -v);
  if (q.spreadHome !== null) {
    add("spread", "away", neg(q.spreadHome), q.spreadAwayOdds, neg(q.openSpreadHome), q.openSpreadAwayOdds);
    add("spread", "home", q.spreadHome, q.spreadHomeOdds, q.openSpreadHome, q.openSpreadHomeOdds);
  }
  if (q.totalValue !== null) {
    add("total", "over", q.totalValue, q.totalOverOdds, q.openTotal, q.openTotalOverOdds);
    add("total", "under", q.totalValue, q.totalUnderOdds, q.openTotal, q.openTotalUnderOdds);
  }
  if (q.moneylineHome !== null || q.moneylineAway !== null) {
    add("moneyline", "away", null, q.moneylineAway, null, q.openMoneylineAway);
    add("moneyline", "home", null, q.moneylineHome, null, q.openMoneylineHome);
  }
  return rows;
}

/** A side's published numbers moved since the last capture (history-worthy). */
export function splitChanged(
  prev: { line: number | string | null; price: number | null; bets_pct: number; handle_pct: number } | undefined,
  next: SplitRow,
): boolean {
  if (!prev) return true;
  const num = (v: number | string | null) => (v === null ? null : Number(v));
  return (
    num(prev.line) !== next.line ||
    prev.price !== next.price ||
    prev.bets_pct !== next.bets_pct ||
    prev.handle_pct !== next.handle_pct
  );
}
