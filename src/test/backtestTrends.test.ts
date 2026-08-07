import { describe, it, expect } from "vitest";
import { MIN_TREND_SAMPLE, labelBucket } from "@/utils/backtestTrends";

describe("trend labeling gate", () => {
  it("documents the threshold at 50 player-seasons", () => {
    expect(MIN_TREND_SAMPLE).toBe(50);
  });

  it("labels raw_counts at n = 49 and trend at n = 50", () => {
    expect(labelBucket(49)).toBe("raw_counts");
    expect(labelBucket(50)).toBe("trend");
    expect(labelBucket(0)).toBe("raw_counts");
    expect(labelBucket(500)).toBe("trend");
  });
});
