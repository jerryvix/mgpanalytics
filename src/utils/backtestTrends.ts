// Trend-labeling gate for archetype buckets.
//
// MIN_TREND_SAMPLE reasoning: a bucket accuracy rate is a binomial
// proportion, and its 95% CI half-width at the p = 0.5 null is
// 1.96 * sqrt(0.25 / n):
//    n = 30  -> +/- 17.9 points
//    n = 50  -> +/- 13.9 points
//    n = 100 -> +/-  9.8 points
// n = 50 is the smallest sample where an actionable market bias (a bucket
// over-rate or bust-rate of >= 65%) sits clearly outside a coin flip's CI.
// n = 30 would trend-label pure noise; n = 100 would leave most cells
// permanently unlabeled with an 8-season backfill. Below the threshold the
// UI shows raw counts ("beat ADP in 3 of 3 seasons") with NO trend styling -
// one rule, mirroring the isTopTenFinish "one rule for green" ethos.

export const MIN_TREND_SAMPLE = 50;

export type BucketLabel = "trend" | "raw_counts";

export function labelBucket(sampleSize: number): BucketLabel {
  return sampleSize >= MIN_TREND_SAMPLE ? "trend" : "raw_counts";
}
