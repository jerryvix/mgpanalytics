// The one DraftKings line rule, shared by the app and the chat.
//
// betting_lines (sync-betting-splits, every run) and the odds tables (the
// daily games syncs) both carry ESPN's DraftKings feed. For each market:
//  - the stored line shows, unless the odds row captured a DIFFERENT number
//    after it: the fresher capture wins;
//  - a market with no stored line falls back to the odds row;
//  - when a newer odds row agrees, the stored line still shows (only it has
//    the away spread price), as of the newer capture.
// src/lib/marketPulse.ts re-exports this for Market Pulse, the slate cards,
// Today's Board and the chat's stored-splits answers; gemini-chat and
// analyst-query import it directly. Every surface and every chat answer so
// quotes the same number. Pure and import-free, so Vite and Deno both load
// it (src/test/marketPulse.test.ts covers it).

export type LineMarket = "spread" | "total" | "moneyline";
export type LineSide = "away" | "home" | "over" | "under";
export const LINE_MARKETS: LineMarket[] = ["spread", "total", "moneyline"];

/** Sports sync-betting-splits stores DraftKings lines (and splits) for */
export const LINE_SPORTS: ReadonlySet<string> = new Set(["NCAAF", "NFL"]);

/** [away, home] or [over, under] */
export const LINE_SIDES: Record<LineMarket, [LineSide, LineSide]> = {
  spread: ["away", "home"],
  moneyline: ["away", "home"],
  total: ["over", "under"],
};

/** A betting_lines row: DraftKings' current and opening number for one side. */
export interface LineRowLike {
  market: string;
  side: string;
  line: number | string | null;
  price: number | null;
  open_line: number | string | null;
  open_price: number | null;
  captured_at: string;
}

/** A betting_lines row with its game */
export interface GameLineRow extends LineRowLike {
  game_id: string;
}

/** The single-book odds row; spread_value/spread_odds are HOME-relative */
export interface OddsRowLike {
  spread_value: number | null;
  spread_odds: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  total_value: number | null;
  total_over_odds: number | null;
  total_under_odds: number | null;
  updated_at?: string | null;
}

/** An odds row as a surface renders it after withStoredLine */
export interface StoredOddsRow extends OddsRowLike {
  /** The away side's spread price. Only a stored line has it (the odds tables keep the home price), else null. */
  spread_away_odds: number | null;
}

export interface Quote {
  line: number | null;
  price: number | null;
}

/** A market's DraftKings number and where it came from */
export interface LineChoice {
  source: "lines" | "odds";
  /** [away, home] or [over, under] */
  quotes: [Quote, Quote];
  /** When DraftKings was last seen showing this number */
  asOf: string | null;
}

/**
 * An American price's implied probability (0..1); null for no price or 0,
 * which is not a price. src/lib/odds.ts re-exports this one.
 */
export function americanToImpliedProb(price: number | null | undefined): number | null {
  if (price === null || price === undefined || price === 0 || !Number.isFinite(price)) return null;
  return price > 0 ? 100 / (price + 100) : -price / (-price + 100);
}

/** PostgREST may return numeric columns as strings */
export function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Even money is +100 (DraftKings' own convention); -100 is the same price written the other way. */
export function evenMoney(price: number | null | undefined): number | null {
  if (price === null || price === undefined || !Number.isFinite(price)) return null;
  return price === -100 ? 100 : price;
}

/** "+245", "-305", "+100" for even money; `empty` when there is no price. */
export function fmtAmerican(price: number | null | undefined, empty = "-"): string {
  const p = evenMoney(price);
  if (p === null) return empty;
  return p > 0 ? `+${p}` : `${p}`;
}

export function latestOf(rows: Array<{ captured_at: string }>): string | null {
  return rows.map((r) => r.captured_at).sort().pop() ?? null;
}

/** Epoch ms of a capture time; unknown or unreadable sorts before everything */
function timeOf(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
}

/** The odds row's quote for one market, or null when the row lacks it. */
export function oddsQuotes(market: LineMarket, o: OddsRowLike | null): [Quote, Quote] | null {
  if (!o) return null;
  if (market === "spread") {
    const home = toNumber(o.spread_value);
    if (home === null) return null;
    // The odds tables store the home spread price only
    return [
      { line: home === 0 ? 0 : -home, price: null },
      { line: home, price: evenMoney(o.spread_odds) },
    ];
  }
  if (market === "total") {
    const total = toNumber(o.total_value);
    if (total === null) return null;
    return [
      { line: total, price: evenMoney(o.total_over_odds) },
      { line: total, price: evenMoney(o.total_under_odds) },
    ];
  }
  if (o.moneyline_away == null && o.moneyline_home == null) return null;
  return [
    { line: null, price: evenMoney(o.moneyline_away) },
    { line: null, price: evenMoney(o.moneyline_home) },
  ];
}

/** Every value the odds row carries for the market equals the stored pair (it lacks the away spread price) */
function sameNumber(stored: [Quote, Quote], odds: [Quote, Quote]): boolean {
  return ([0, 1] as const).every(
    (i) =>
      (odds[i].line === null || odds[i].line === stored[i].line) &&
      (odds[i].price === null || odds[i].price === stored[i].price),
  );
}

/** The one line rule (see the header). Null when neither source has the market. */
export function chooseLine(market: LineMarket, lines: LineRowLike[], odds: OddsRowLike | null): LineChoice | null {
  const [sideA, sideB] = LINE_SIDES[market];
  const a = lines.find((r) => r.market === market && r.side === sideA);
  const b = lines.find((r) => r.market === market && r.side === sideB);
  const fromOdds = oddsQuotes(market, odds);
  const oddsAt = odds?.updated_at ?? null;
  if (!a || !b) return fromOdds ? { source: "odds", quotes: fromOdds, asOf: oddsAt } : null;
  const stored: [Quote, Quote] = [
    { line: toNumber(a.line), price: evenMoney(a.price) },
    { line: toNumber(b.line), price: evenMoney(b.price) },
  ];
  const storedAt = latestOf([a, b]);
  if (!fromOdds || timeOf(oddsAt) <= timeOf(storedAt)) return { source: "lines", quotes: stored, asOf: storedAt };
  if (sameNumber(stored, fromOdds)) return { source: "lines", quotes: stored, asOf: oddsAt };
  return { source: "odds", quotes: fromOdds, asOf: oddsAt };
}

const ODDS_KEYS = [
  "spread_value",
  "spread_odds",
  "moneyline_home",
  "moneyline_away",
  "total_value",
  "total_over_odds",
  "total_under_odds",
] as const;

/**
 * A game's odds-table row with each market's number picked by chooseLine,
 * for surfaces that render the odds tables (the slate cards, Today's Board,
 * the chat's odds context): it then shows the same number as Market Pulse. A
 * market keeps the odds row's values when that row is the fresher, different
 * capture or when no line is stored; no odds row and no stored line gives
 * null. updated_at stays the odds row's, so feeding the result back to
 * chooseLine picks the same numbers again.
 */
export function withStoredLine<T extends Partial<OddsRowLike>>(odds: T | null, lines: LineRowLike[]): (T & StoredOddsRow) | null {
  if (!odds && !lines.length) return null;
  const base = { ...(odds ?? {}) } as T & StoredOddsRow;
  for (const k of ODDS_KEYS) base[k] = k === "spread_value" || k === "total_value" ? toNumber(base[k]) : evenMoney(base[k]);
  const row: OddsRowLike | null = odds ? { ...base, updated_at: odds.updated_at ?? null } : null;
  base.spread_away_odds = null;

  const spread = chooseLine("spread", lines, row);
  if (spread?.source === "lines") {
    const [away, home] = spread.quotes;
    base.spread_value = home.line;
    base.spread_odds = home.price;
    base.spread_away_odds = away.price;
  }
  const total = chooseLine("total", lines, row);
  if (total?.source === "lines") {
    const [over, under] = total.quotes;
    base.total_value = over.line;
    base.total_over_odds = over.price;
    base.total_under_odds = under.price;
  }
  const ml = chooseLine("moneyline", lines, row);
  if (ml?.source === "lines") {
    const [away, home] = ml.quotes;
    base.moneyline_away = away.price;
    base.moneyline_home = home.price;
  }
  return base;
}

/**
 * When DraftKings was last seen showing the numbers withStoredLine picks for
 * a game: the OLDEST of its markets' capture times, so an "updated X ago"
 * label never oversells the stalest number it covers.
 */
export function lineAsOf(odds: OddsRowLike | null, lines: LineRowLike[]): string | null {
  const times = LINE_MARKETS.map((m) => chooseLine(m, lines, odds)?.asOf ?? null).filter((t): t is string => t !== null);
  return times.sort((x, y) => timeOf(x) - timeOf(y))[0] ?? null;
}

/** An odds-table row of any book, as the chat functions read it (plus whatever else the select embedded) */
export type AnyOddsRow = Partial<OddsRowLike> & { game_id: string | number; sportsbook?: string | null; [key: string]: unknown };

/**
 * Odds-table rows with each game's DraftKings row showing the app's number
 * (withStoredLine), plus a DraftKings row for a game that only has a stored
 * line. updated_at becomes the oldest capture behind the numbers (lineAsOf).
 * Other books pass through. Freshest first. gameIds defaults to the rows' own.
 */
export function overlayDkOdds(odds: AnyOddsRow[], stored: Map<string, LineRowLike[]>, gameIds: Array<string | number> = []): AnyOddsRow[] {
  const isDk = (o: AnyOddsRow) => String(o.sportsbook ?? "").toLowerCase().includes("draftkings");
  const ids = gameIds.length ? gameIds : [...new Set(odds.map((o) => o.game_id))];
  const out: AnyOddsRow[] = odds.filter((o) => !isDk(o));
  for (const id of ids) {
    const dk = odds.find((o) => String(o.game_id) === String(id) && isDk(o)) ?? null;
    const lines = stored.get(String(id)) ?? [];
    const merged = withStoredLine(dk, lines);
    if (!merged) continue;
    out.push({
      ...merged,
      game_id: dk?.game_id ?? id,
      sportsbook: dk?.sportsbook ?? "draftkings",
      updated_at: lineAsOf(dk as OddsRowLike | null, lines) ?? dk?.updated_at ?? null,
    });
  }
  return out.sort((a, b) => timeOf(b.updated_at as string | null) - timeOf(a.updated_at as string | null));
}

/**
 * The chat's odds rows for a league, with DraftKings' number as the app shows
 * it (NCAAF, NFL: the stored line wherever it is the fresher capture). Other
 * leagues come back unchanged. Throws when betting_lines can't be read.
 */
// deno-lint-ignore no-explicit-any
export async function withDkLines(client: any, league: string, odds: AnyOddsRow[], gameIds: Array<string | number> = []): Promise<AnyOddsRow[]> {
  const ids = gameIds.length ? gameIds : [...new Set(odds.map((o) => o.game_id))];
  if (!LINE_SPORTS.has(league) || ids.length === 0) return odds;
  return overlayDkOdds(odds, await fetchDkLines(client, league, ids), ids);
}

/**
 * Every stored DraftKings line for these games, by our game id. The sync
 * keys betting_lines by OUR ids (NCAAF by the ESPN id in external_id; NFL,
 * whose games table is BDL-keyed, paired with ESPN's scoreboard on both
 * teams and kickoff), so callers never re-match names. Throws on a failed
 * read; sports without stored lines read nothing.
 */
// deno-lint-ignore no-explicit-any
export async function fetchDkLines(client: any, sport: string, gameIds: Array<string | number>): Promise<Map<string, GameLineRow[]>> {
  const byGame = new Map<string, GameLineRow[]>();
  if (!LINE_SPORTS.has(sport)) return byGame;
  const ids = [...new Set(gameIds.map(String))];
  for (let i = 0; i < ids.length; i += 100) {
    // 100 ids per in() filter: a full Saturday in one filter makes a very long URL
    const { data, error } = await client
      .from("betting_lines")
      .select("game_id, market, side, line, price, open_line, open_price, captured_at")
      .eq("source", "draftkings")
      .eq("sport", sport)
      .in("game_id", ids.slice(i, i + 100));
    if (error) throw new Error(`betting_lines read failed: ${error.message ?? String(error)}`);
    for (const r of (data ?? []) as GameLineRow[]) byGame.set(r.game_id, [...(byGame.get(r.game_id) ?? []), r]);
  }
  return byGame;
}
