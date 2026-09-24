// Market Pulse: one DraftKings number per market, where the bets and the money
// sit, and three markers computed only from stored data. The ONE copy of these
// rules: the app (src/lib/marketPulse.ts re-exports this file, and
// src/utils/sharpMoneyDetector.ts its sharp rule) and the chat edge functions
// (gemini-chat, through _shared/pulse-chat.ts) all build their read with it,
// so Game Insights, the slate cards, Today's Board and the chat can never
// disagree. Pure, and imports only ./dk-line.ts, so Vite and Deno both load
// it (src/test/marketPulse.test.ts covers it).
//
// ONE LINE RULE (chooseLine, _shared/dk-line.ts). A market's number comes from
// betting_lines, which sync-betting-splits refreshes from ESPN's DraftKings
// feed for every game in the window, unless the sport's odds table (the same
// ESPN feed, written by the daily games syncs) captured a different number
// after it: the fresher capture wins. A market with no stored line falls back
// to the odds table (MLB always, since its lines are not in betting_lines),
// with DraftKings' open from the latest odds_history capture when the caller
// passes one. The DK Network splits page supplies % of bets and % of money
// only: its odds column lags DraftKings. Movement always reads from DK's open
// to the number shown.

import {
  americanToImpliedProb,
  chooseLine,
  evenMoney,
  fmtAmerican,
  LINE_MARKETS,
  LINE_SIDES,
  LINE_SPORTS,
  latestOf,
  toNumber,
  type LineMarket,
  type LineRowLike,
  type LineSide,
  type OddsRowLike,
  type Quote,
} from "./dk-line.ts";

export {
  chooseLine,
  evenMoney,
  fmtAmerican,
  lineAsOf,
  withStoredLine,
  type LineChoice,
  type LineRowLike,
  type OddsRowLike,
  type Quote,
  type StoredOddsRow,
} from "./dk-line.ts";

export type PulseMarket = LineMarket;
export type PulseSide = LineSide;
export const PULSE_MARKETS: PulseMarket[] = LINE_MARKETS;

/** Sports sync-betting-splits stores DraftKings splits and lines for */
export const SPLITS_SPORTS: ReadonlySet<string> = LINE_SPORTS;

/** Threshold for the sharp read: money share at least this many points above bet share */
export const SHARP_THRESHOLD = 10;

/**
 * Detect the sharp side of a two-way market. The canonical read: the side
 * draws a MINORITY of the bets (under 50%) but a MAJORITY of the money (over
 * 50%), and its money share beats its bet share by SHARP_THRESHOLD points or
 * more: fewer, bigger tickets against the crowd. Money merely outpacing bets
 * on the side the crowd also backs is not a sharp read, so at most one side
 * of a market can qualify.
 */
export function isSharpSide(betsPercent: number, moneyPercent: number): boolean {
  return betsPercent < 50 && moneyPercent > 50 && moneyPercent - betsPercent >= SHARP_THRESHOLD;
}

/**
 * Sharp money: a minority of the bets (under 50%), a majority of the money
 * (over 50%), and money share at least this many points above bet share.
 */
export const SHARP_EDGE_PTS = SHARP_THRESHOLD;
/**
 * Public side: this share of the tickets or more. Two-way splits drift
 * between 50 and 59 on noise alone; 60 is the usual "clear majority" cut.
 */
export const PUBLIC_BETS_PCT = 60;
/**
 * When the number itself held, a price move of this many implied-probability
 * points counts as the market moving (-110 to -120 is +2.1; -110 to -115, 1.1,
 * does not). Spreads and totals move in half points first.
 */
export const PRICE_MOVE_PTS = 2;

/** A betting_splits row (PostgREST may return numeric columns as strings). Bets and money only. */
export interface SplitRowLike {
  market: string;
  side: string;
  bets_pct: number;
  handle_pct: number;
  captured_at: string;
  /**
   * How fresh DraftKings' page was: the response time of an uncached fetch,
   * or the first capture of a page flagged as unchanged (sync-betting-splits).
   * Labels "split X ago"; captured_at when absent.
   */
  source_as_of?: string | null;
}

/** When DraftKings last showed a split row's numbers */
export const splitAsOf = (r: SplitRowLike): string => r.source_as_of ?? r.captured_at;

/** An opening number from elsewhere (MLB: the latest odds_history DraftKings capture). */
export interface OpenQuoteLike {
  market: string;
  side: string;
  open_line: number | string | null;
  open_price: number | null;
}

export interface PulseInput {
  splits: SplitRowLike[];
  lines: LineRowLike[];
  odds: OddsRowLike | null;
  opens?: OpenQuoteLike[];
}

export interface PulseSideView {
  side: PulseSide;
  line: number | null;
  price: number | null;
  betsPct: number | null;
  handlePct: number | null;
  openLine: number | null;
  openPrice: number | null;
  sharp: boolean;
  publicSide: boolean;
  reverseMove: boolean;
}

export interface PulseMarketView {
  market: PulseMarket;
  /** [away, home] or [over, under] */
  sides: [PulseSideView, PulseSideView];
  hasSplits: boolean;
  /** A side at 0% of the bets or the money: likely a handful of tickets, so no signal fires */
  thin: boolean;
  /** DraftKings' open is known for both sides (movement text and the reverse-move marker need it) */
  hasOpen: boolean;
  /** Where the shown number came from; null when no line is stored (bars only) */
  lineSource: "lines" | "odds" | null;
  lineAsOf: string | null;
  splitsAsOf: string | null;
}

const num = toNumber;
const SIDES = LINE_SIDES;

/** Implied-probability change in points for a side's price, + = side got shorter (backed). */
function priceMovePts(open: number | null, current: number | null): number | null {
  const o = americanToImpliedProb(open);
  const c = americanToImpliedProb(current);
  if (o === null || c === null) return null;
  return (c - o) * 100;
}

/**
 * Did the market move TOWARD this side since DraftKings opened it? Spreads
 * and totals move on the number first (a half point or more), and on the
 * price only when the number held. Moneylines move on implied probability
 * (odds.ts convention: + = the side is being backed).
 */
export function movedToward(
  market: PulseMarket,
  side: PulseSide,
  current: Quote,
  open: Quote,
): boolean | null {
  if (market === "moneyline") {
    const pts = priceMovePts(open.price, current.price);
    return pts === null ? null : pts >= PRICE_MOVE_PTS;
  }
  if (current.line === null || open.line === null) return null;
  const delta = current.line - open.line;
  if (Math.abs(delta) >= 0.5) {
    // Spread: the side's own number shrinking (+3.5 to +2.5, -2.5 to -3.5)
    // means the market is backing it. Total: over is backed when it rises.
    if (market === "spread") return delta < 0;
    return side === "over" ? delta > 0 : delta < 0;
  }
  const pts = priceMovePts(open.price, current.price);
  return pts === null ? null : pts >= PRICE_MOVE_PTS;
}

export function buildMarketView(market: PulseMarket, input: PulseInput): PulseMarketView | null {
  const [sideA, sideB] = SIDES[market];
  const find = <T extends { market: string; side: string }>(rows: T[] | undefined, side: PulseSide) =>
    rows?.find((r) => r.market === market && r.side === side);

  const splitA = find(input.splits, sideA);
  const splitB = find(input.splits, sideB);
  const hasSplits = !!splitA && !!splitB;
  const lineA = find(input.lines, sideA);
  const lineB = find(input.lines, sideB);
  const choice = chooseLine(market, input.lines, input.odds);
  // No number from either source: a split still shows as bars only
  if (!choice && !hasSplits) return null;
  const lineSource: PulseMarketView["lineSource"] = choice?.source ?? null;
  const quotes: [Quote, Quote] = choice?.quotes ?? [
    { line: null, price: null },
    { line: null, price: null },
  ];
  const lineAsOf = choice?.asOf ?? null;

  const openOf = (line: LineRowLike | undefined, side: PulseSide): Quote => {
    const src = line && (line.open_line !== null || line.open_price !== null) ? line : find(input.opens, side);
    return { line: num(src?.open_line), price: evenMoney(src?.open_price) };
  };

  const sides = ([0, 1] as const).map((i) => {
    const split = i === 0 ? splitA : splitB;
    const open = openOf(i === 0 ? lineA : lineB, i === 0 ? sideA : sideB);
    return {
      side: i === 0 ? sideA : sideB,
      line: quotes[i].line,
      price: quotes[i].price,
      betsPct: split ? split.bets_pct : null,
      handlePct: split ? split.handle_pct : null,
      openLine: open.line,
      openPrice: open.price,
      sharp: false,
      publicSide: false,
      reverseMove: false,
    } satisfies PulseSideView;
  }) as [PulseSideView, PulseSideView];

  const thin = hasSplits && sides.some((s) => s.betsPct === 0 || s.handlePct === 0);
  const hasOpen =
    lineSource !== null && sides.every((s) => (market === "moneyline" ? s.openPrice !== null : s.openLine !== null));

  if (hasSplits && !thin) {
    // The canonical sharp read, side A first: at most one side qualifies
    if (isSharpSide(sides[0].betsPct!, sides[0].handlePct!)) sides[0].sharp = true;
    else if (isSharpSide(sides[1].betsPct!, sides[1].handlePct!)) sides[1].sharp = true;

    for (const s of sides) s.publicSide = (s.betsPct ?? 0) >= PUBLIC_BETS_PCT;

    // Reverse move: the public piles onto one side, the number moves the other way
    if (hasOpen) {
      sides.forEach((s, i) => {
        const other = sides[1 - i];
        if (!other.publicSide) return;
        s.reverseMove =
          movedToward(market, s.side, { line: s.line, price: s.price }, { line: s.openLine, price: s.openPrice }) === true;
      });
    }
  }

  return {
    market,
    sides,
    hasSplits,
    thin,
    hasOpen,
    lineSource,
    lineAsOf,
    splitsAsOf: hasSplits ? latestOf([splitA!, splitB!].map((r) => ({ captured_at: splitAsOf(r) }))) : null,
  };
}

export function buildMarketPulse(input: PulseInput): Record<PulseMarket, PulseMarketView | null> {
  return {
    spread: buildMarketView("spread", input),
    total: buildMarketView("total", input),
    moneyline: buildMarketView("moneyline", input),
  };
}

const fmtPrice = (v: number | null) => fmtAmerican(v);
/** "+3", "-2.5", "PK" */
export const fmtSpread = (v: number | null) => (v === null ? "-" : v === 0 ? "PK" : v > 0 ? `+${v}` : `${v}`);

/**
 * "Open X → Now Y" for a market, from DraftKings' open to the number shown.
 * Spreads read from the away side and moneylines as away / home. A number
 * that held shows its price move: a spread's in parentheses (the caller names
 * the away team), a total's labeled with the Over, since its two prices
 * differ. Null when DK's open is unknown.
 */
export function openToNow(view: PulseMarketView): string | null {
  if (!view.hasOpen) return null;
  const [a, b] = view.sides;
  if (view.market === "moneyline") {
    const pair = (x: number | null, y: number | null) => `${fmtPrice(x)} / ${fmtPrice(y)}`;
    if (a.price === a.openPrice && b.price === b.openPrice) return `Open ${pair(a.openPrice, b.openPrice)}, unchanged`;
    return `Open ${pair(a.openPrice, b.openPrice)} → Now ${pair(a.price, b.price)}`;
  }
  const fmtLine = (v: number | null) => (view.market === "spread" ? fmtSpread(v) : v === null ? "-" : `${v}`);
  const held = a.line === a.openLine;
  const priced = held && a.openPrice !== null && a.price !== null;
  if (held && (!priced || a.openPrice === a.price)) return `Open ${fmtLine(a.openLine)}, unchanged`;
  if (priced && view.market === "total") {
    return `Open ${fmtLine(a.openLine)} → Now ${fmtLine(a.line)} · Over ${fmtPrice(a.openPrice)} → ${fmtPrice(a.price)}`;
  }
  const shown = (line: number | null, price: number | null) => `${fmtLine(line)}${priced ? ` (${fmtPrice(price)})` : ""}`;
  return `Open ${shown(a.openLine, a.openPrice)} → Now ${shown(a.line, a.price)}`;
}

/** "just now", "12m ago", "3h ago", "2d ago" */
export function agoLabel(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
