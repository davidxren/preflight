import { describe, expect, it } from "vitest";
import { checkPatternBaseRates, patternBaseRates } from "@/engine/check-pattern-base-rates";
import { PATTERN_DETECTORS, triggerIndices } from "@/engine/pattern-detectors";
import { regimeStats } from "@/engine/pattern-regimes";
import { forwardReturn } from "@/engine/price-series";
import {
  REGIMES,
  REGIME_LOOKBACK_SESSIONS,
  partitionByRegime,
  regimeAt,
  regimeCuts,
  trailingVolatility,
} from "@/engine/volatility-regime";
import type { DailyBar } from "@/market/types";
import { fixture } from "./support/snapshots";

/**
 * The volatility-regime split (v1.1 S1). The property that matters is that the
 * three terciles partition the occurrences exactly — every occurrence with a
 * defined volatility lands in one and only one of them, and the ones from the
 * opening sessions land in none rather than being swept into the bottom.
 */

const BARS = fixture("AAPL").bars;

function series(closes: number[]): DailyBar[] {
  return closes.map((close, i) => ({
    date: `d${i}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
}

describe("trailing volatility", () => {
  it("is undefined until a full window exists", () => {
    const volatility = trailingVolatility(BARS);
    for (let i = 0; i < REGIME_LOOKBACK_SESSIONS; i += 1) {
      expect(volatility[i]).toBeNull();
    }
    expect(volatility[REGIME_LOOKBACK_SESSIONS]).not.toBeNull();
  });

  it("is zero for a series that never moves, and positive when it does", () => {
    const flat = trailingVolatility(series(new Array(100).fill(50)));
    expect(flat[99]).toBe(0);

    const moving = trailingVolatility(
      series(Array.from({ length: 100 }, (_, i) => 50 + (i % 2) * 5)),
    );
    expect(moving[99]!).toBeGreaterThan(0);
  });

  it("reads higher for a wilder series than a calmer one", () => {
    const calm = trailingVolatility(
      series(Array.from({ length: 200 }, (_, i) => 100 + (i % 2) * 0.1)),
    );
    const wild = trailingVolatility(
      series(Array.from({ length: 200 }, (_, i) => 100 + (i % 2) * 10)),
    );
    expect(wild[199]!).toBeGreaterThan(calm[199]!);
  });
});

describe("the terciles", () => {
  const volatility = trailingVolatility(BARS);
  const cuts = regimeCuts(volatility)!;

  it("are cut from this ticker's own readings, in order", () => {
    expect(cuts).not.toBeNull();
    expect(cuts.lower).toBeLessThanOrEqual(cuts.upper);
  });

  it("place every defined reading in exactly one regime", () => {
    let placed = 0;
    let undefinedReadings = 0;
    for (let i = 0; i < BARS.length; i += 1) {
      const regime = regimeAt(volatility, i, cuts);
      if (regime === null) {
        undefinedReadings += 1;
        expect(volatility[i]).toBeNull();
      } else {
        placed += 1;
        expect(REGIMES).toContain(regime);
      }
    }
    expect(placed + undefinedReadings).toBe(BARS.length);
    expect(undefinedReadings).toBe(REGIME_LOOKBACK_SESSIONS);
  });

  it("split the readings roughly into thirds", () => {
    const counts = { low: 0, middle: 0, high: 0 };
    for (let i = 0; i < BARS.length; i += 1) {
      const regime = regimeAt(volatility, i, cuts);
      if (regime) counts[regime] += 1;
    }
    const total = counts.low + counts.middle + counts.high;
    for (const regime of REGIMES) {
      expect(counts[regime] / total).toBeGreaterThan(0.25);
      expect(counts[regime] / total).toBeLessThan(0.42);
    }
  });

  it("returns nothing rather than guessing when there are too few readings", () => {
    expect(regimeCuts([])).toBeNull();
    expect(regimeCuts([null, null])).toBeNull();
  });
});

describe("partitioning occurrences", () => {
  const volatility = trailingVolatility(BARS);
  const cuts = regimeCuts(volatility)!;

  it("partitions every detector's occurrences exactly, at both horizons", () => {
    for (const detector of PATTERN_DETECTORS) {
      const triggers = triggerIndices(detector, BARS);
      for (const horizon of [5, 20]) {
        const withWindow = triggers.filter(
          (t) => forwardReturn(BARS, t, horizon) !== null,
        );
        const { byRegime, undefinedRegime } = partitionByRegime(
          withWindow,
          volatility,
          cuts,
        );

        // Exhaustive: nothing is lost between the buckets.
        const total =
          byRegime.low.length +
          byRegime.middle.length +
          byRegime.high.length +
          undefinedRegime.length;
        expect(total).toBe(withWindow.length);

        // Disjoint: nothing is counted twice.
        const all = [
          ...byRegime.low,
          ...byRegime.middle,
          ...byRegime.high,
          ...undefinedRegime,
        ];
        expect(new Set(all).size).toBe(all.length);
        expect([...all].sort((a, b) => a - b)).toEqual([...withWindow].sort((a, b) => a - b));

        // An occurrence with no volatility reading belongs to no tercile.
        for (const index of undefinedRegime) expect(volatility[index]).toBeNull();
      }
    }
  });

  it("reports a sample size per tercile that sums to the placed occurrences", () => {
    for (const detector of PATTERN_DETECTORS) {
      const stats = regimeStats(detector, BARS);
      const triggers = triggerIndices(detector, BARS);
      for (const horizon of [5, 20]) {
        const withWindow = triggers.filter(
          (t) => forwardReturn(BARS, t, horizon) !== null,
        );
        const { undefinedRegime } = partitionByRegime(withWindow, volatility, cuts);
        const summed = stats
          .filter((s) => s.horizon === horizon)
          .reduce((total, s) => total + s.sampleSize, 0);
        expect(summed).toBe(withWindow.length - undefinedRegime.length);
      }
    }
  });

  it("never reports more independent occurrences than occurrences", () => {
    for (const detector of PATTERN_DETECTORS) {
      for (const stat of regimeStats(detector, BARS)) {
        expect(stat.nonOverlappingSampleSize).toBeLessThanOrEqual(stat.sampleSize);
      }
    }
  });

  it("warns per tercile, off that tercile's independent count", () => {
    for (const detector of PATTERN_DETECTORS) {
      for (const stat of regimeStats(detector, BARS)) {
        if (stat.nonOverlappingSampleSize < 30) {
          expect(stat.smallSampleWarning).toBe(
            `Small sample — read with caution (N=${stat.nonOverlappingSampleSize})`,
          );
        } else {
          expect(stat.smallSampleWarning).toBeNull();
        }
      }
    }
  });

  it("computes nothing when the history is too short for a window", () => {
    expect(regimeStats(PATTERN_DETECTORS[0], BARS.slice(0, 30))).toEqual([]);
  });
});

describe("what check 5 renders for the regimes", () => {
  const check = checkPatternBaseRates(fixture("AAPL"));

  it("shows three tercile rows under every pattern and horizon", () => {
    for (const rate of patternBaseRates(fixture("AAPL").bars)) {
      for (const horizon of [5, 20]) {
        const rows = check.figures.filter((f) =>
          new RegExp(
            `^${rate.label} — ${horizon}-session, (low|middle|high) volatility$`,
          ).test(f.label),
        );
        expect(rows).toHaveLength(3);
        for (const row of rows) {
          // median · N (non-overlapping)
          expect(row.value).toMatch(/^([+−]\d+\.\d\d%|—) · [\d,]+ \([\d,]+\)$/);
        }
      }
    }
  });

  it("explains the split, the counts, and the absent interval in a note", () => {
    const notes = check.notes.join(" ");
    expect(notes).toMatch(/tercile/);
    expect(notes).toMatch(/60-session/);
    expect(notes).toMatch(/carry no interval/);
    expect(notes).toMatch(/belong to no tercile/);
  });
});
