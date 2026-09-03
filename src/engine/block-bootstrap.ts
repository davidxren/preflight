/**
 * The stationary block bootstrap of Politis & Romano (1994): blocks of
 * geometrically distributed length, wrapping at the end of the series, which
 * keeps the resampled series stationary and preserves short-range dependence.
 *
 * Overlapping forward windows are exactly the dependence check 5 has to
 * account for — two triggers three sessions apart share most of their
 * 20-session outcome — so resampling has to move blocks, not single days
 * (v1.1 D2).
 */

/** Owner default: geometric block lengths with a mean of 20 sessions. */
export const MEAN_BLOCK_SESSIONS = 20;

/** Owner default: the number of resamples every interval is read from. */
export const RESAMPLES = 2000;

/**
 * Fixed so a report is reproducible: the same history yields the same
 * interval every time it is rendered (CLAUDE.md §11).
 */
export const BOOTSTRAP_SEED = 0x5eed_c0de;

/**
 * Fills `out` with indices into a series of `length` items. A new block starts
 * with probability 1/`meanBlock`; otherwise the walk advances one step and
 * wraps, which is what makes the resampled series stationary.
 */
export function stationaryBlockIndices(
  out: Int32Array,
  length: number,
  random: () => number,
  meanBlock: number = MEAN_BLOCK_SESSIONS,
): void {
  if (length <= 0) return;
  const restart = 1 / meanBlock;
  let index = Math.floor(random() * length) % length;
  for (let i = 0; i < out.length; i += 1) {
    out[i] = index;
    if (random() < restart) {
      index = Math.floor(random() * length) % length;
    } else {
      index = index + 1 === length ? 0 : index + 1;
    }
  }
}

/**
 * The value at `fraction` of the way through `values`, by the nearest-rank
 * method on a sorted copy. Used for the 2.5th and 97.5th percentiles that
 * bound a bootstrap interval; returns null for an empty set rather than zero.
 */
export function percentileOf(
  values: readonly number[],
  fraction: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = Float64Array.from(values).sort();
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[rank];
}

/**
 * The two-sided p-value obtained by inverting the percentile interval: the
 * smallest level at which the interval around the resampled differences
 * excludes zero. Reported this way so the interval and the p-value can never
 * disagree about the same statistic.
 */
export function twoSidedPValue(resampled: readonly number[]): number | null {
  if (resampled.length === 0) return null;
  let atOrBelowZero = 0;
  let atOrAboveZero = 0;
  for (const value of resampled) {
    if (value <= 0) atOrBelowZero += 1;
    if (value >= 0) atOrAboveZero += 1;
  }
  const n = resampled.length;
  const smaller = Math.min(atOrBelowZero / n, atOrAboveZero / n);
  return Math.min(1, 2 * smaller);
}
