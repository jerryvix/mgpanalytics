// American-odds math for win-probability displays.

/**
 * Convert an American moneyline price to its implied probability (0..1).
 * Returns null for null/undefined/0/non-finite input — 0 is not a valid price.
 */
export function americanToImpliedProb(price: number | null | undefined): number | null {
  if (price === null || price === undefined || price === 0 || !Number.isFinite(price)) return null;
  return price > 0 ? 100 / (price + 100) : -price / (-price + 100);
}

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
