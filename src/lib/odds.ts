// American-odds math for win-probability displays.

/**
 * Convert an American moneyline price to its implied probability (0..1).
 * Returns null for null/undefined/0/non-finite input - 0 is not a valid price.
 * One copy, shared with the Market Pulse rules and the chat edge functions
 * (supabase/functions/_shared/dk-line.ts).
 */
import { americanToImpliedProb } from "../../supabase/functions/_shared/dk-line";

export { americanToImpliedProb };

/**
 * No-vig win probabilities for a two-way market. Normalizes both sides'
 * implied probabilities so they sum to 1 (strips the sportsbook margin).
 * Returns null unless both sides resolve.
 */
export function impliedPair(
  home: number | null | undefined,
  away: number | null | undefined
): { home: number; away: number } | null {
  const h = americanToImpliedProb(home);
  const a = americanToImpliedProb(away);
  if (h === null || a === null) return null;
  const total = h + a;
  if (total <= 0) return null;
  return { home: h / total, away: a / total };
}

/**
 * Convert a win probability (0..1 exclusive) back to an American price.
 * Inverse of americanToImpliedProb - p above 0.5 yields a negative (favorite)
 * price, so the result is always a legal price (never inside ±100). Even
 * money is +100, DraftKings' convention, never -100 (a -100 here once put
 * Liberty's +100 open on the board as "-100").
 */
export function probToAmerican(p: number | null | undefined): number | null {
  if (p === null || p === undefined || !Number.isFinite(p) || p <= 0 || p >= 1) return null;
  const price = p > 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
  return price === -100 ? 100 : price;
}

/** Even money as +100, and an American price formatted with its sign ("+245", "-305"). */
export { evenMoney, fmtAmerican } from "../../supabase/functions/_shared/dk-line";

/**
 * Consensus American price across books. American odds are discontinuous -
 * nothing exists between -100 and +100 - so they must NEVER be averaged
 * arithmetically (that's how a board ends up showing "-36.4"). Convert each
 * book to implied probability, average there, convert back.
 */
export function consensusAmerican(prices: Array<number | null | undefined>): number | null {
  const probs = prices
    .map(americanToImpliedProb)
    .filter((p): p is number => p !== null);
  if (probs.length === 0) return null;
  return probToAmerican(probs.reduce((s, x) => s + x, 0) / probs.length);
}

export interface PriceMove {
  /** Consensus opening price, legal American integer */
  open: number;
  /** Consensus current price, legal American integer */
  current: number;
  /** Movement in implied-probability points; + means the market is backing this side */
  move: number;
  /** Books that contributed a full open→current pair */
  books: number;
}

/**
 * Consensus open→current movement for a priced market (moneyline).
 * Averages per-book implied probabilities on both ends, reports the shift in
 * probability points - the sign is meaningful: + = price shortening = money
 * arriving on this side. (Raw American deltas get this backwards for
 * favorites: -112 → -136 is arithmetically "down" but the team is being BET.)
 */
export function consensusPriceMove(
  pairs: Array<{ open: number | null | undefined; current: number | null | undefined }>
): PriceMove | null {
  const opens: number[] = [];
  const currents: number[] = [];
  for (const p of pairs) {
    const o = americanToImpliedProb(p.open);
    const c = americanToImpliedProb(p.current);
    if (o === null || c === null) continue;
    opens.push(o);
    currents.push(c);
  }
  if (opens.length === 0) return null;
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const openProb = avg(opens);
  const currentProb = avg(currents);
  const open = probToAmerican(openProb);
  const current = probToAmerican(currentProb);
  if (open === null || current === null) return null;
  return {
    open,
    current,
    move: Math.round((currentProb - openProb) * 1000) / 10,
    books: opens.length,
  };
}

/** The identity of one quote in odds_history: a game, a book, a bet type, a side. */
export interface SnapshotRow {
  game_id: string;
  bookmaker: string;
  odds_type: string;
  team: string | null;
  timestamp: string | null;
}

/**
 * odds_history is append-only: every sync adds a row per game, book, bet
 * type and side. Reduce it to the LATEST capture of each before any
 * consensus or movement math. Feeding every capture to consensusPriceMove
 * averages a book against its own earlier prices (a price nobody offered)
 * and counts captures as "books" (Sep 24 2026: NYJ @ DET showed +242, the
 * mean of the 06:12 and 07:12 DraftKings captures, labeled "2 books").
 */
export function latestSnapshots<T extends SnapshotRow>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const r of rows) {
    const key = `${r.game_id}|${r.bookmaker}|${r.odds_type}|${r.team ?? ""}`;
    const prev = latest.get(key);
    if (!prev || (r.timestamp ?? "") > (prev.timestamp ?? "")) latest.set(key, r);
  }
  return [...latest.values()];
}
