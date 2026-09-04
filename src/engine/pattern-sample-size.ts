/**
 * How many independent observations sit behind a pattern statistic, and the
 * wording used when there are too few. Shared by check 5's headline figures
 * and by its volatility-regime rows so both apply the same threshold.
 */

/** The horizons check 5 reports, in sessions. */
export const HORIZONS = [5, 20] as const;

/** Below this many independent triggers the numbers are too thin to read, per §12. */
export const SMALL_SAMPLE_THRESHOLD = 30;

/** The exact wording required by §12 when a sample is thin. */
export function smallSampleWarning(n: number): string {
  return `Small sample — read with caution (N=${n})`;
}
