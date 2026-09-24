// What counts as a posted DraftKings MLB market. One rule for the ESPN odds
// parser (espn-odds.ts stores null for anything else) and every MLB surface
// (src/lib/mlbRunLine.ts), which shows its empty state for a row stored
// before the rule existed.
//
// DraftKings' main MLB run line is always +/-1.5 with a price. ESPN lists a
// game's DraftKings item before the run line is up and fills the gap with
// spread 0 and no price: the Sep 24 2026 21:00 UTC sync stored Rockies @ White
// Sox that way and the slate read "RUN LINE: Sox +0 (N/A)" (32 games in August
// were first captured the same way). An unposted total arrives as 0 @ 0.
// Pure and import-free, so Deno and Vite both load it.

/** A real American price: -100 or shorter, +100 or longer. 0 and blanks are not prices. */
export function isAmericanPrice(p: number | null | undefined): p is number {
  return typeof p === "number" && Number.isFinite(p) && Math.abs(p) >= 100;
}

/** PostgREST may return numeric columns as strings */
function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** DraftKings' MLB run line number: +1.5 or -1.5 */
export function isRunLineNumber(line: number | string | null | undefined): boolean {
  const n = toNum(line);
  return n !== null && Math.abs(n) === 1.5;
}

/** A posted MLB run line: +/-1.5 with a price. */
export function isPostedRunLine(line: number | string | null | undefined, price: number | null | undefined): boolean {
  return isRunLineNumber(line) && isAmericanPrice(price);
}

/** A posted MLB total: more than 0 runs. */
export function isPostedTotal(total: number | string | null | undefined): boolean {
  const n = toNum(total);
  return n !== null && n > 0;
}

interface MlbOddsRowLike {
  spread_value?: number | null;
  spread_odds?: number | null;
  total_value?: number | null;
  total_over_odds?: number | null;
  total_under_odds?: number | null;
}

/**
 * An mlb_odds row as MLB surfaces show it: a run line that is not posted
 * (+/-1.5 with a price) and a 0 total read as absent (null), so each surface
 * shows its own "no line" state instead of "+0 (N/A)".
 */
export function postedMlbOdds<T extends MlbOddsRowLike>(row: T): T {
  let out = row;
  if (!isPostedRunLine(row.spread_value, row.spread_odds)) out = { ...out, spread_value: null, spread_odds: null };
  if (!isPostedTotal(row.total_value)) out = { ...out, total_value: null, total_over_odds: null, total_under_odds: null };
  return out;
}
