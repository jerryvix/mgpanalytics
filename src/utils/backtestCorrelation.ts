// Correlation analysis for the backtester: do prop accuracy, win-total
// accuracy, and ADP accuracy move together? Implemented as small pure
// functions in TS (not SQL) so the math is reviewable and unit-tested
// against hand-computed fixtures. Two cuts:
//   1. season-level: Spearman rank correlation across per-season accuracy
//      scalars for each source pair (few observations - the UI copy states
//      the n and calls the result directional only);
//   2. player-level: 2x2 contingency (beat prop x beat ADP) via the phi
//      coefficient, for player-seasons holding both a prop line and a
//      qualifying ADP.

function rank(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    // average ranks over ties
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null; // constant series - undefined
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman rank correlation (Pearson over average-ranked data; tie-safe).
 * Returns null when n < 3 or a series is constant. */
export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length) return null;
  return pearson(rank(xs), rank(ys));
}

/**
 * Phi coefficient for a 2x2 contingency table:
 *          Y yes   Y no
 *   X yes    a      b
 *   X no     c      d
 * Returns null when any margin is empty (phi undefined).
 */
export function phi(a: number, b: number, c: number, d: number): number | null {
  const denom = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
  if (denom === 0) return null;
  return (a * d - b * c) / denom;
}
