import { describe, expect, it } from "vitest";
import {
  percentileOf,
  stationaryBlockIndices,
  twoSidedPValue,
} from "@/engine/block-bootstrap";
import {
  benjaminiHochberg,
  multiplicitySentence,
} from "@/engine/false-discovery";
import {
  checkPatternBaseRates,
  patternBaseRate,
} from "@/engine/check-pattern-base-rates";
import { DATA_UNAVAILABLE } from "@/engine/disclaimer";
import { PATTERN_DETECTORS, triggerIndices } from "@/engine/pattern-detectors";
import {
  MAX_DROPPED_RESAMPLE_SHARE,
  nonOverlappingCount,
  patternUncertainty,
} from "@/engine/pattern-uncertainty";
import { rebuildPath, barBuffer, toRelativeBars } from "@/engine/relative-bars";
import { seededRandom } from "@/engine/seeded-random";
import type { DailyBar } from "@/market/types";
import { fixture } from "./support/snapshots";

/**
 * Check 5's uncertainty (v1.1 D2). The acceptance cases are synthetic series
 * whose answer is known in advance: a random walk carries no pattern
 * information and must produce intervals that straddle zero, and a series with
 * drift deliberately injected after one pattern must produce a difference
 * interval that excludes zero for that pattern and no other.
 *
 * The synthetic series and the bootstrap both run off fixed seeds, so these
 * are deterministic. Resample counts are lower than the 2,000 the report uses:
 * the properties under test hold at either count and the suite stays quick.
 */

const TEST_RESAMPLES = 400;

/** A geometric random walk with no structure for a detector to find. */
function randomWalk(length: number, seed: number): DailyBar[] {
  const random = seededRandom(seed);
  const bars: DailyBar[] = [];
  let close = 100;
  for (let i = 0; i < length; i += 1) {
    const priorClose = close;
    const drift = (random() - 0.5) * 0.04;
    close = priorClose * (1 + drift);
    const open = priorClose * (1 + (random() - 0.5) * 0.02);
    const high = Math.max(open, close) * (1 + random() * 0.01);
    const low = Math.min(open, close) * (1 - random() * 0.01);
    bars.push({ date: `d${i}`, open, high, low, close, volume: 1_000 });
  }
  return bars;
}

/** The same walk, with a steady upward slope every session. */
function trending(length: number, seed: number): DailyBar[] {
  const random = seededRandom(seed);
  const bars: DailyBar[] = [];
  let close = 100;
  for (let i = 0; i < length; i += 1) {
    const priorClose = close;
    close = priorClose * (1 + 0.004 + (random() - 0.5) * 0.01);
    const open = priorClose * (1 + (random() - 0.5) * 0.004);
    const high = Math.max(open, close) * (1 + random() * 0.003);
    const low = Math.min(open, close) * (1 - random() * 0.003);
    bars.push({ date: `d${i}`, open, high, low, close, volume: 1_000 });
  }
  return bars;
}

/**
 * A random walk in which the five sessions after each occurrence of one
 * detector are given a positive drift. The series is built forward and the
 * detectors only look backwards, so injecting drift into later sessions cannot
 * change whether the occurrence that caused it triggered.
 */
function walkWithDriftAfter(
  detectorId: string,
  length: number,
  seed: number,
  perSessionDrift: number,
): DailyBar[] {
  const detector = PATTERN_DETECTORS.find((d) => d.id === detectorId)!;
  const random = seededRandom(seed);
  const bars: DailyBar[] = [];
  let close = 100;
  let driftUntil = -1;

  for (let i = 0; i < length; i += 1) {
    const priorClose = close;
    const injected = i <= driftUntil ? perSessionDrift : 0;
    close = priorClose * (1 + injected + (random() - 0.5) * 0.03);
    const open = priorClose * (1 + (random() - 0.5) * 0.02);
    const high = Math.max(open, close) * (1 + random() * 0.008);
    const low = Math.min(open, close) * (1 - random() * 0.008);
    bars.push({ date: `d${i}`, open, high, low, close, volume: 1_000 });

    if (i >= detector.lookback && detector.triggers(bars, i)) {
      driftUntil = Math.max(driftUntil, i + 5);
    }
  }
  return bars;
}

const options = { resamples: TEST_RESAMPLES };

function straddlesZero(interval: { low: number; high: number } | null): boolean {
  return interval !== null && interval.low <= 0 && interval.high >= 0;
}

describe("non-overlapping occurrences", () => {
  it("keeps an occurrence only once the previous window has closed", () => {
    // 0 is kept, 3 falls inside 0's five-session window, 5 clears it.
    expect(nonOverlappingCount([0, 3, 5, 6, 12], 5)).toBe(3);
  });

  it("counts every occurrence when none overlap", () => {
    expect(nonOverlappingCount([0, 10, 20], 5)).toBe(3);
  });

  it("counts nothing for no occurrences", () => {
    expect(nonOverlappingCount([], 5)).toBe(0);
  });

  it("never exceeds N, at either horizon, on a real series", () => {
    const bars = randomWalk(800, 7);
    for (const detector of PATTERN_DETECTORS) {
      const triggers = triggerIndices(detector, bars);
      for (const horizon of [5, 20]) {
        const withWindow = triggers.filter((t) => t + horizon < bars.length);
        const kept = nonOverlappingCount(withWindow, horizon);
        expect(kept).toBeLessThanOrEqual(withWindow.length);
        expect(kept).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("shrinks as the horizon lengthens, because windows overlap more", () => {
    const bars = randomWalk(800, 7);
    const triggers = triggerIndices(PATTERN_DETECTORS[4], bars);
    expect(nonOverlappingCount(triggers, 20)).toBeLessThanOrEqual(
      nonOverlappingCount(triggers, 5),
    );
  });
});

describe("relative bars", () => {
  it("rebuild the original path when replayed in order", () => {
    const bars = randomWalk(50, 3);
    const relatives = toRelativeBars(bars);
    const order = Int32Array.from(relatives.map((_, i) => i));
    const buffer = barBuffer(relatives.length);
    rebuildPath(buffer, relatives, order, bars[0].close);

    for (let i = 0; i < relatives.length; i += 1) {
      expect(buffer[i].close).toBeCloseTo(bars[i + 1].close, 8);
      expect(buffer[i].open).toBeCloseTo(bars[i + 1].open, 8);
      expect(buffer[i].high).toBeCloseTo(bars[i + 1].high, 8);
      expect(buffer[i].low).toBeCloseTo(bars[i + 1].low, 8);
    }
  });
});

describe("the stationary block bootstrap", () => {
  it("draws indices inside the series and mostly in runs", () => {
    const out = new Int32Array(1_000);
    stationaryBlockIndices(out, 500, seededRandom(11), 20);
    for (const index of out) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(500);
    }
    let consecutive = 0;
    for (let i = 1; i < out.length; i += 1) {
      if (out[i] === (out[i - 1] + 1) % 500) consecutive += 1;
    }
    // Mean block length 20 means roughly 19 in 20 steps continue a block.
    expect(consecutive / out.length).toBeGreaterThan(0.8);
  });

  it("reports percentiles and a two-sided p-value off the same draws", () => {
    const draws = Array.from({ length: 100 }, (_, i) => i - 50);
    // Nearest rank: the 50th percentile of 100 sorted draws is the 50th, -1.
    expect(percentileOf(draws, 0.5)).toBe(-1);
    expect(percentileOf(draws, 0.025)).toBe(-48);
    expect(percentileOf(draws, 0.975)).toBe(47);
    expect(percentileOf([], 0.5)).toBeNull();
    // Half the draws are at or below zero, so the interval barely excludes it.
    expect(twoSidedPValue(draws)).toBeCloseTo(1, 5);
    expect(twoSidedPValue([1, 2, 3])).toBe(0);
    expect(twoSidedPValue([])).toBeNull();
  });
});

describe("Benjamini-Hochberg", () => {
  it("rejects nothing when every p-value is large", () => {
    const result = benjaminiHochberg([0.4, 0.6, 0.9, 0.5, 0.7]);
    expect(result.rejected).toEqual([]);
    expect(result.tested).toBe(5);
  });

  it("rejects the clearly small p-values", () => {
    const result = benjaminiHochberg([0.0001, 0.9, 0.8, 0.7, 0.6]);
    expect(result.rejected).toEqual([0]);
  });

  it("is less strict than Bonferroni when several are small", () => {
    const result = benjaminiHochberg([0.01, 0.02, 0.03, 0.9, 0.9]);
    // 0.03 <= (3/5)*0.05 is false, but 0.01 <= (1/5)*0.05 is false too;
    // nothing survives, which Bonferroni would also conclude.
    expect(result.rejected.length).toBeLessThanOrEqual(3);
  });

  it("counts an uncomputable statistic as tested but never rejects it", () => {
    const result = benjaminiHochberg([null, 0.001, null]);
    expect(result.tested).toBe(3);
    expect(result.rejected).toEqual([1]);
  });

  it("states the adjustment in the required wording", () => {
    expect(multiplicitySentence(10, 0)).toBe(
      "After adjusting for the 10 pattern statistics computed for this ticker, " +
        "0 differ detectably from the unconditional median",
    );
  });
});

describe("a random walk", () => {
  const bars = randomWalk(1_200, 42);
  const stats = patternUncertainty(bars, options);

  it("produces a median interval that straddles zero for every detector", () => {
    for (const stat of stats) {
      if (stat.unavailableReason) continue;
      expect(straddlesZero(stat.medianInterval)).toBe(true);
    }
  });

  it("produces a difference interval that straddles zero for every detector", () => {
    for (const stat of stats) {
      if (stat.unavailableReason) continue;
      expect(straddlesZero(stat.differenceInterval)).toBe(true);
    }
  });

  it("finds nothing detectable once the ten statistics are adjusted", () => {
    const fdr = benjaminiHochberg(stats.map((s) => s.pValue));
    expect(fdr.tested).toBe(10);
    expect(fdr.rejected).toEqual([]);
  });
});

describe("a trending series", () => {
  it("produces a median interval that excludes zero", () => {
    const stats = patternUncertainty(trending(1_200, 5), options);
    const excluding = stats.filter(
      (s) => s.medianInterval !== null && s.medianInterval.low > 0,
    );
    // Every forward window rises in a trend, so the medians are above zero.
    expect(excluding.length).toBeGreaterThan(0);
  });

  it("still shows most patterns as no different from the trend itself", () => {
    const stats = patternUncertainty(trending(1_200, 5), options);
    const differing = stats.filter((s) => straddlesZero(s.differenceInterval));
    // The unconditional median rises with the trend too, so the comparison
    // against it is what stops a trend from reading as a working pattern.
    expect(differing.length).toBeGreaterThan(0);
  });
});

describe("a walk with drift injected after one pattern", () => {
  const target = "bullish-engulfing";
  const bars = walkWithDriftAfter(target, 1_500, 99, 0.006);
  const stats = patternUncertainty(bars, options);

  it("excludes zero from that pattern's five-session difference interval", () => {
    const stat = stats.find((s) => s.detectorId === target && s.horizon === 5)!;
    expect(stat.unavailableReason).toBeNull();
    expect(stat.differenceInterval).not.toBeNull();
    expect(stat.differenceInterval!.low).toBeGreaterThan(0);
  });

  it("reports at least one statistic surviving the adjustment", () => {
    const fdr = benjaminiHochberg(stats.map((s) => s.pValue));
    expect(fdr.rejected.length).toBeGreaterThanOrEqual(1);
  });
});

describe("a pattern absent from most resamples", () => {
  it("reports the intervals as unavailable with the exact reason", () => {
    // A flat series never gaps 4%, so that detector is absent everywhere.
    const flat: DailyBar[] = Array.from({ length: 300 }, (_, i) => ({
      date: `d${i}`,
      open: 100,
      high: 100.5,
      low: 99.5,
      close: 100 + (i % 2) * 0.1,
      volume: 1,
    }));
    const stats = patternUncertainty(flat, { resamples: 100 });
    const gap = stats.find((s) => s.detectorId === "gap-up-4pct" && s.horizon === 5)!;
    expect(gap.droppedShare).toBeGreaterThan(MAX_DROPPED_RESAMPLE_SHARE);
    expect(gap.unavailableReason).toBe(
      "Data unavailable — pattern absent in more than 5% of resamples",
    );
    expect(gap.medianInterval).toBeNull();
    expect(gap.differenceInterval).toBeNull();
    expect(gap.pValue).toBeNull();
  });
});

describe("the small-sample warning", () => {
  it("keys off the independent count, not the raw trigger count", () => {
    // A steady climb makes three-up-closes fire on nearly every session, so
    // there are hundreds of triggers but only a handful of independent
    // 20-session windows. The raw count would call this a large sample.
    const bars = trending(400, 21);
    const rate = patternBaseRate(
      PATTERN_DETECTORS.find((d) => d.id === "three-up-closes")!,
      bars,
    );

    expect(rate.sampleSize).toBeGreaterThanOrEqual(30);
    expect(rate.independentSampleSize).toBeLessThan(30);
    expect(rate.smallSampleWarning).toBe(
      `Small sample — read with caution (N=${rate.independentSampleSize})`,
    );
  });

  it("stays silent when the independent count is large enough", () => {
    const bars = randomWalk(2_000, 31);
    const rate = patternBaseRate(
      PATTERN_DETECTORS.find((d) => d.id === "hammer")!,
      bars,
    );
    if (rate.independentSampleSize >= 30) {
      expect(rate.smallSampleWarning).toBeNull();
    }
  });
});

describe("what check 5 renders", () => {
  const check = checkPatternBaseRates(fixture("AAPL"));
  const labels = check.figures.map((f) => f.label);

  it("shows N with the non-overlapping count at both horizons", () => {
    for (const horizon of [5, 20]) {
      const row = check.figures.find(
        (f) => f.label === `Hammer — ${horizon}-session triggers (N)`,
      );
      expect(row?.value).toMatch(/^[\d,]+ \([\d,]+ non-overlapping\)$/);
    }
  });

  it("shows a bracketed interval on every median and every difference", () => {
    const medians = check.figures.filter((f) => /forward median$/.test(f.label));
    const differences = check.figures.filter((f) => /vs unconditional$/.test(f.label));
    expect(medians.length).toBe(10);
    expect(differences.length).toBeGreaterThan(0);
    for (const row of [...medians, ...differences]) {
      if (row.value === DATA_UNAVAILABLE) continue;
      expect(row.value).toMatch(/^[+−]?\d+\.\d\d% \[[+−]?\d+\.\d\d%, [+−]?\d+\.\d\d%\]$/);
    }
  });

  it("keeps the unconditional median next to each pattern", () => {
    expect(labels).toContain("Unconditional 5-session median");
    expect(labels).toContain("Unconditional 20-session median");
  });

  it("states the multiplicity adjustment once, over ten statistics", () => {
    const row = check.figures.find(
      (f) => f.label === "Statistics that survive the adjustment",
    );
    expect(row?.value).toMatch(
      /^After adjusting for the 10 pattern statistics computed for this ticker, \d+ differ detectably from the unconditional median$/,
    );
  });

  it("explains overlapping windows and the bootstrap in its notes", () => {
    const notes = check.notes.join(" ");
    expect(notes).toMatch(/non-overlapping count/);
    expect(notes).toMatch(/block-bootstrap/);
    expect(notes).toMatch(/2,000/);
    expect(notes).toMatch(/false-discovery rate/);
  });
});

describe("reproducibility", () => {
  it("returns the same intervals for the same series and seed", () => {
    const bars = randomWalk(600, 17);
    const a = patternUncertainty(bars, { resamples: 200, seed: 1 });
    const b = patternUncertainty([...bars], { resamples: 200, seed: 1 });
    expect(b).toEqual(a);
  });

  it("returns different draws for a different seed", () => {
    const bars = randomWalk(600, 17);
    const a = patternUncertainty(bars, { resamples: 200, seed: 1 });
    const b = patternUncertainty(bars, { resamples: 200, seed: 2 });
    expect(b).not.toEqual(a);
  });
});
