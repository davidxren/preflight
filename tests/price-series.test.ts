import { describe, expect, it } from "vitest";
import {
  allForwardReturns,
  forwardReturn,
  median,
  percentPositive,
  percentileRank,
  trailingReturn,
} from "@/engine/price-series";
import type { DailyBar } from "@/market/types";

function closes(values: number[]): DailyBar[] {
  return values.map((c, i) => ({
    date: `2020-01-${String(i + 1).padStart(2, "0")}`,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 1,
  }));
}

describe("median", () => {
  it("takes the middle value of an odd-length set", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values of an even-length set", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns null for an empty set rather than zero", () => {
    expect(median([])).toBeNull();
  });

  it("does not mutate its input", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("percentPositive", () => {
  it("counts only strictly positive values", () => {
    expect(percentPositive([1, -1, 0, 2])).toBe(50);
  });

  it("returns null for an empty set", () => {
    expect(percentPositive([])).toBeNull();
  });
});

describe("forward returns", () => {
  const bars = closes([100, 110, 121]);

  it("computes (close at t+k − close at t) ÷ close at t", () => {
    expect(forwardReturn(bars, 0, 1)).toBeCloseTo(0.1, 12);
    expect(forwardReturn(bars, 0, 2)).toBeCloseTo(0.21, 12);
  });

  it("returns null when the forward window runs off the end", () => {
    expect(forwardReturn(bars, 2, 1)).toBeNull();
    expect(forwardReturn(bars, 1, 5)).toBeNull();
  });

  it("collects only complete windows", () => {
    expect(allForwardReturns(bars, 1)).toHaveLength(2);
    expect(allForwardReturns(bars, 2)).toHaveLength(1);
    expect(allForwardReturns(bars, 3)).toHaveLength(0);
  });
});

describe("trailingReturn", () => {
  it("measures back from the last bar", () => {
    expect(trailingReturn(closes([100, 110]), 1)).toBeCloseTo(0.1, 12);
  });

  it("returns null when the history is too short for the window", () => {
    expect(trailingReturn(closes([100, 110]), 5)).toBeNull();
  });
});

describe("percentileRank", () => {
  it("reports the share at or below the value", () => {
    expect(percentileRank([1, 2, 3, 4], 3)).toBe(75);
    expect(percentileRank([1, 2, 3, 4], 4)).toBe(100);
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0);
  });

  it("returns null for an empty population", () => {
    expect(percentileRank([], 1)).toBeNull();
  });
});
