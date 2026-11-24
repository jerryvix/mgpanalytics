/**
 * Sportsbook-standard odds notation for every MGP screen (owner rule, docs/mobile/DECISIONS.md D-039).
 * New UI formats odds only through these helpers so the app and the website read the same way.
 *
 *   formatAmerican(-110)            -> "-110"     formatAmerican(200) -> "+200"
 *   formatSpread(-6.5)              -> "-6.5"     formatSpread(0)     -> "PK"
 *   formatSpreadWithPrice(-6.5,-110)-> "-6.5 (-110)"
 *   formatTeamSpread("Oregon",-6.5) -> "Oregon -6.5"
 *   formatTotal("over", 52.5)       -> "O 52.5"   formatTotalLine(52.5) -> "O/U 52.5"
 *   formatMovement(-4.5, -6.5)      -> "-4.5 → -6.5"
 *   formatRecord(5, 4, 1)           -> "5-4-1"    formatAts(5, 5) -> "5-5 ATS"
 *
 * Minus is the plain ASCII hyphen-minus "-" (owner rule, Nov 2026: no em dashes, en dashes or
 * typographic minus signs anywhere on the site). This replaced D-039's U+2212.
 */

function signed(n: number): string {
  if (n > 0) return `+${trim(n)}`;
  if (n < 0) return `-${trim(Math.abs(n))}`;
  return "0";
}

/** 6.5 -> "6.5", 3 -> "3", 3.0 -> "3" (half points keep .5; whole numbers drop the decimal). */
function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/** American odds: -110 -> "-110", 200 -> "+200", 100 -> "+100". */
export function formatAmerican(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return "";
  return signed(Math.round(price));
}

/** Spread line: -6.5 -> "-6.5", 6.5 -> "+6.5", 0 -> "PK" (pick'em). */
export function formatSpread(line: number | null | undefined): string {
  if (line == null || !Number.isFinite(line)) return "";
  return line === 0 ? "PK" : signed(line);
}

/** Spread with its price: "-6.5 (-110)". */
export function formatSpreadWithPrice(line: number | null | undefined, price: number | null | undefined): string {
  const l = formatSpread(line);
  const p = formatAmerican(price);
  if (!l) return "";
  return p ? `${l} (${p})` : l;
}

/** "Oregon -6.5", "Michigan State +6.5", "Oregon PK". */
export function formatTeamSpread(team: string, line: number | null | undefined): string {
  const l = formatSpread(line);
  return l ? `${team} ${l}` : "";
}

/** One side of a total: "O 52.5" or "U 52.5". */
export function formatTotal(side: "over" | "under", line: number | null | undefined): string {
  if (line == null || !Number.isFinite(line)) return "";
  return `${side === "over" ? "O" : "U"} ${trim(line)}`;
}

/** The total line without a side: "O/U 52.5". */
export function formatTotalLine(line: number | null | undefined): string {
  if (line == null || !Number.isFinite(line)) return "";
  return `O/U ${trim(line)}`;
}

/** Spread movement from open to now: "-4.5 → -6.5". */
export function formatMovement(open: number | null | undefined, now: number | null | undefined): string {
  const o = formatSpread(open);
  const n = formatSpread(now);
  if (!o || !n) return "";
  return `${o} → ${n}`;
}

/** Win-loss record: "5-5", or "5-4-1" when there are pushes or ties. */
export function formatRecord(wins: number, losses: number, pushes = 0): string {
  return pushes > 0 ? `${wins}-${losses}-${pushes}` : `${wins}-${losses}`;
}

/** Against-the-spread record: "5-5 ATS", "5-4-1 ATS". */
export function formatAts(wins: number, losses: number, pushes = 0): string {
  return `${formatRecord(wins, losses, pushes)} ATS`;
}
