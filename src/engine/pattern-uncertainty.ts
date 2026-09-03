import type { DailyBar } from "@/market/types";
import {
  BOOTSTRAP_SEED,
  MEAN_BLOCK_SESSIONS,
  RESAMPLES,
  percentileOf,
  stationaryBlockIndices,
  twoSidedPValue,
} from "./block-bootstrap";
import { PATTERN_DETECTORS, triggerIndices, type PatternDetector } from "./pattern-detectors";
import { allForwardReturns, forwardReturn, median } from "./price-series";
import { barBuffer, rebuildPath, toRelativeBars } from "./relative-bars";
import {
  conditionalMedianFast,
  unconditionalMedianFast,
} from "./resample-medians";
import { seededRandom } from "./seeded-random";

/**
 * Uncertainty around check 5's base rates (v1.1 D2). Every median is reported
 * with a block-bootstrap interval, against the same resample's unconditional
 * median, so the reader can see whether a pattern's number is distinguishable
 * from what the series did anyway.
 *
 * The five detector definitions are untouched; this measures them.
 */

/**
 * Above this share of resamples missing the pattern entirely, the intervals
 * describe only the resamples that happened to contain it, which would flatter
 * a rare pattern. Owner default.
 */
export const MAX_DROPPED_RESAMPLE_SHARE = 0.05;

export const DROPPED_RESAMPLES_REASON =
  "Data unavailable — pattern absent in more than 5% of resamples";

export interface Interval {
  low: number;
  high: number;
}

export interface UncertainStat {
  detectorId: string;
  horizon: number;
  /** Median forward return after the pattern, as a fraction. */
  observedMedian: number | null;
  /** Observed median minus the unconditional median over the same series. */
  observedDifference: number | null;
  /** Percentile interval on the median, or null when too many resamples dropped. */
  medianInterval: Interval | null;
  /** Percentile interval on the difference, on the same condition. */
  differenceInterval: Interval | null;
  /** Two-sided p-value for "the difference is zero", or null when unusable. */
  pValue: number | null;
  /** Share of resamples in which the pattern did not occur at all. */
  droppedShare: number;
  /** Set when the intervals could not be reported, with the reason to render. */
  unavailableReason: string | null;
  /** Triggers with a complete forward window at this horizon. */
  sampleSize: number;
  /** Triggers left once overlapping forward windows are removed. */
  nonOverlappingSampleSize: number;
}

/**
 * Occurrences whose forward windows do not overlap: an occurrence is kept only
 * if it starts after the previous kept occurrence's window has closed. Two
 * triggers three sessions apart share most of a 20-session outcome, so the
 * count of independent observations is smaller than N — often much smaller.
 */
export function nonOverlappingCount(
  triggers: readonly number[],
  horizon: number,
): number {
  let kept = 0;
  let freeFrom = -Infinity;
  for (const t of triggers) {
    if (t >= freeFrom) {
      kept += 1;
      freeFrom = t + horizon;
    }
  }
  return kept;
}

/** Median forward return over `horizon` for the days in `triggers`. */
function conditionalMedian(
  bars: readonly DailyBar[],
  triggers: readonly number[],
  horizon: number,
): number | null {
  const returns: number[] = [];
  for (const t of triggers) {
    const r = forwardReturn(bars, t, horizon);
    if (r !== null) returns.push(r);
  }
  return median(returns);
}

export interface UncertaintyOptions {
  resamples?: number;
  meanBlock?: number;
  seed?: number;
  horizons?: readonly number[];
  detectors?: readonly PatternDetector[];
}

/**
 * Two thousand resamples over a decade of bars costs seconds, and a report is
 * rebuilt on every submission. The result is a pure function of the series and
 * a fixed seed, so it is memoised in process — no new table, nothing persisted,
 * and sample mode still never opens the database.
 */
const MEMO_LIMIT = 8;
const memo = new Map<string, UncertainStat[]>();

function signatureOf(
  bars: readonly DailyBar[],
  resamples: number,
  meanBlock: number,
  seed: number,
  horizons: readonly number[],
  detectorIds: readonly string[],
): string {
  const first = bars[0];
  const last = bars[bars.length - 1];
  return [
    bars.length,
    first.date,
    first.close,
    last.date,
    last.close,
    resamples,
    meanBlock,
    seed,
    horizons.join("-"),
    detectorIds.join("-"),
  ].join("|");
}

/**
 * Runs the block bootstrap once and reads every statistic off the same set of
 * resamples, so all ten share one resampling effort rather than ten.
 */
export function patternUncertainty(
  bars: readonly DailyBar[],
  options: UncertaintyOptions = {},
): UncertainStat[] {
  const {
    resamples = RESAMPLES,
    meanBlock = MEAN_BLOCK_SESSIONS,
    seed = BOOTSTRAP_SEED,
    horizons = [5, 20],
    detectors = PATTERN_DETECTORS,
  } = options;

  if (bars.length === 0) return [];

  const signature = signatureOf(
    bars,
    resamples,
    meanBlock,
    seed,
    horizons,
    detectors.map((d) => d.id),
  );
  const cached = memo.get(signature);
  if (cached) return cached;

  const relatives = toRelativeBars(bars);
  const pathLength = relatives.length;

  // Collected per detector and horizon across resamples, one slot each.
  const slots = detectors.length * horizons.length;
  const medianDraws: number[][] = Array.from({ length: slots }, () => []);
  const differenceDraws: number[][] = Array.from({ length: slots }, () => []);
  const slot = (d: number, h: number): number => d * horizons.length + h;

  const observed = detectors.map((detector) => {
    const triggers = triggerIndices(detector, bars);
    return horizons.map((horizon) => {
      const withWindow = triggers.filter(
        (t) => forwardReturn(bars, t, horizon) !== null,
      );
      const conditional = conditionalMedian(bars, triggers, horizon);
      const unconditional = median(allForwardReturns(bars, horizon));
      return {
        triggers,
        sampleSize: withWindow.length,
        nonOverlappingSampleSize: nonOverlappingCount(withWindow, horizon),
        median: conditional,
        difference:
          conditional !== null && unconditional !== null
            ? conditional - unconditional
            : null,
      };
    });
  });

  if (pathLength > 0 && bars[0].close > 0) {
    const random = seededRandom(seed);
    const order = new Int32Array(pathLength);
    const buffer = barBuffer(pathLength);
    // Scratch reused across every resample: two thousand passes would
    // otherwise allocate and sort millions of short-lived array elements.
    const scratch = new Float64Array(pathLength);
    const unconditional = new Array<number | null>(horizons.length);

    for (let r = 0; r < resamples; r += 1) {
      stationaryBlockIndices(order, pathLength, random, meanBlock);
      rebuildPath(buffer, relatives, order, bars[0].close);

      for (let h = 0; h < horizons.length; h += 1) {
        unconditional[h] = unconditionalMedianFast(buffer, horizons[h], scratch);
      }
      for (let d = 0; d < detectors.length; d += 1) {
        const triggers = triggerIndices(detectors[d], buffer);
        for (let h = 0; h < horizons.length; h += 1) {
          const conditional = conditionalMedianFast(
            buffer,
            triggers,
            horizons[h],
            scratch,
          );
          // A resample in which the pattern never occurs contributes nothing;
          // it is counted as dropped rather than scored as zero.
          if (conditional === null) continue;
          medianDraws[slot(d, h)].push(conditional);
          const uncond = unconditional[h];
          if (uncond !== null) {
            differenceDraws[slot(d, h)].push(conditional - uncond);
          }
        }
      }
    }
  }

  const stats: UncertainStat[] = [];
  for (let d = 0; d < detectors.length; d += 1) {
    for (let h = 0; h < horizons.length; h += 1) {
      const draws = medianDraws[slot(d, h)];
      const diffs = differenceDraws[slot(d, h)];
      const droppedShare = resamples > 0 ? 1 - draws.length / resamples : 1;
      const tooMany = droppedShare > MAX_DROPPED_RESAMPLE_SHARE;
      const point = observed[d][h];

      stats.push({
        detectorId: detectors[d].id,
        horizon: horizons[h],
        observedMedian: point.median,
        observedDifference: point.difference,
        medianInterval: tooMany ? null : intervalOf(draws),
        differenceInterval: tooMany ? null : intervalOf(diffs),
        pValue: tooMany ? null : twoSidedPValue(diffs),
        droppedShare,
        unavailableReason: tooMany ? DROPPED_RESAMPLES_REASON : null,
        sampleSize: point.sampleSize,
        nonOverlappingSampleSize: point.nonOverlappingSampleSize,
      });
    }
  }

  if (memo.size >= MEMO_LIMIT) {
    // Oldest first: a Map iterates in insertion order.
    const oldest = memo.keys().next();
    if (!oldest.done) memo.delete(oldest.value);
  }
  memo.set(signature, stats);
  return stats;
}

/** The 2.5th and 97.5th percentiles, which bound a 95% interval. */
function intervalOf(draws: readonly number[]): Interval | null {
  const low = percentileOf(draws, 0.025);
  const high = percentileOf(draws, 0.975);
  return low === null || high === null ? null : { low, high };
}
