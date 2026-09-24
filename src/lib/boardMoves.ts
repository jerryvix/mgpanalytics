// Today's Board rails (Sharpest Moves, Market Signal) and the grid's ▲/▼
// arrows: DraftKings' move from its open to the number the grid shows. Pure,
// so the rules are unit-tested (boardMoves.test.ts).
//
// Market Pulse QC round 2, Sep 24 2026: the rails read odds_history's own
// "current" price, hours older than the grid's (WSU ML +340 in the rail, +320
// in the grid), listed a game that isn't on the board (Miami @ Clemson, Oct
// 3), and keyed the grid's arrows by team, so CMU @ Miami's empty moneyline
// cell showed Miami's Oct 3 move. Now every move is built per grid game, from
// DraftKings' open (the stored line's, as Market Pulse reads it, or the
// latest odds_history capture) to the grid's own number (chooseLine), and
// keyed by game.

import { americanToImpliedProb } from "@/lib/odds";
import { evenMoney, type OddsRowLike, type OpenQuoteLike } from "@/lib/marketPulse";

export interface SidedMove {
  gameId: string;
  /** Spread | Moneyline | Total */
  market: string;
  /** Moneyline: implied-probability points (+ = the market backing this side). Spread/Total: line points moved. */
  move: number;
}

export interface BoardMove extends SidedMove {
  /** Team name; "Over" for totals */
  team: string;
  open: number;
  current: number;
  /** [away, home] */
  teamsInGame: [string, string];
}

/**
 * How hard the market moved TOWARD a side, in the src/lib/odds.ts sign
 * convention (+ = the side's implied probability rose, i.e. steamed). A
 * moneyline move is already that. A spread side is backed when its own number
 * shrinks: -7 to -17.5 (the favorite laying more) or +7 to +3 (the dog getting
 * fewer), so its move flips sign. A total's one row keeps its own sign.
 */
export function steamScore(m: SidedMove): number {
  return m.market === "Spread" ? -m.move : m.move;
}

/**
 * One move per game and market: the steamed side of each spread and
 * moneyline pair (the side whose implied probability rose). Totals arrive as
 * one row per game (the Over). A side with no partner passes through. Order
 * follows first appearance.
 */
export function onePerMarket<T extends SidedMove>(moves: T[]): T[] {
  const best = new Map<string, T>();
  for (const m of moves) {
    const key = `${m.gameId}|${m.market}`;
    const prev = best.get(key);
    if (!prev || steamScore(m) > steamScore(prev)) best.set(key, m);
  }
  return [...best.values()];
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Every side's move for one grid game, from DraftKings' open to `now` (the
 * grid's row, after withStoredLine). Moneyline sides move in implied
 * probability, spread sides and the total (as the Over) in points. A side
 * with no open or no current number has no move.
 */
export function gameMoves(game: {
  gameId: string;
  away: string;
  home: string;
  now: Partial<OddsRowLike> | null | undefined;
  opens: OpenQuoteLike[];
}): BoardMove[] {
  const { gameId, away, home, now } = game;
  if (!now) return [];
  const open = (market: string, side: string) => game.opens.find((o) => o.market === market && o.side === side);
  const teamsInGame: [string, string] = [away, home];
  const out: BoardMove[] = [];

  for (const [side, team, current] of [
    ["away", away, now.moneyline_away],
    ["home", home, now.moneyline_home],
  ] as const) {
    const o = evenMoney(open("moneyline", side)?.open_price);
    const c = evenMoney(current);
    const po = americanToImpliedProb(o);
    const pc = americanToImpliedProb(c);
    if (o === null || c === null || po === null || pc === null) continue;
    out.push({ gameId, market: "Moneyline", team, open: o, current: c, move: round1((pc - po) * 100), teamsInGame });
  }

  const homeNow = num(now.spread_value);
  const homeOpen = num(open("spread", "home")?.open_line) ?? negate(num(open("spread", "away")?.open_line));
  if (homeNow !== null && homeOpen !== null) {
    out.push({ gameId, market: "Spread", team: away, open: -homeOpen || 0, current: -homeNow || 0, move: round1(homeOpen - homeNow), teamsInGame });
    out.push({ gameId, market: "Spread", team: home, open: homeOpen, current: homeNow, move: round1(homeNow - homeOpen), teamsInGame });
  }

  const totalNow = num(now.total_value);
  const totalOpen = num(open("total", "over")?.open_line) ?? num(open("total", "under")?.open_line);
  if (totalNow !== null && totalOpen !== null) {
    out.push({ gameId, market: "Total", team: "Over", open: totalOpen, current: totalNow, move: round1(totalNow - totalOpen), teamsInGame });
  }
  return out;
}

function negate(v: number | null): number | null {
  return v === null ? null : -v || 0;
}
