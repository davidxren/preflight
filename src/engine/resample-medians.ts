import type { DailyBar } from "@/market/types";

/**
 * Median arithmetic for the bootstrap's inner loop (v1.1 D2). Two thousand
 * resamples recompute a median over every forward window in the series, twice
 * per resample, so these avoid both the per-comparison callback of a sorted
 * array and the allocation of a fresh one.
 *
 * Every result here is identical to `median()` in price-series.ts, which the
 * observed statistics — the ones the report actually prints — still use.
 */

/**
 * Hoare selection: puts the k-th smallest value at index k, partitioning only
 * the side that can still contain it. Linear on average, where a full sort is
 * n log n — the difference is what makes two thousand resamples affordable.
 */
export function selectNth(values: Float64Array, count: number, k: number): number {
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const pivot = values[(low + high) >> 1];
    let i = low;
    let j = high;
    while (i <= j) {
      while (values[i] < pivot) i += 1;
      while (values[j] > pivot) j -= 1;
      if (i <= j) {
        const swap = values[i];
        values[i] = values[j];
        values[j] = swap;
        i += 1;
        j -= 1;
      }
    }
    if (k <= j) high = j;
    else if (k >= i) low = i;
    else break;
  }
  return values[k];
}

/**
 * The median of the first `count` entries of `scratch`, which it reorders in
 * place. Identical in result to `median()` in price-series.ts, which the
 * observed statistics still use; this one avoids the sort.
 */
export function medianOfScratch(scratch: Float64Array, count: number): number | null {
  if (count === 0) return null;
  const mid = count >> 1;
  if (count % 2 === 1) return selectNth(scratch, count, mid);
  // The lower middle first, then the upper: after selection everything below
  // `mid` is already on the left, so the second search is over a short range.
  const upper = selectNth(scratch, count, mid);
  let lower = -Infinity;
  for (let i = 0; i < mid; i += 1) {
    if (scratch[i] > lower) lower = scratch[i];
  }
  return (lower + upper) / 2;
}

/** Median forward return over every complete window in the resampled path. */
export function unconditionalMedianFast(
  bars: readonly DailyBar[],
  horizon: number,
  scratch: Float64Array,
): number | null {
  let count = 0;
  for (let i = 0; i + horizon < bars.length; i += 1) {
    const from = bars[i].close;
    if (from === 0) continue;
    scratch[count] = (bars[i + horizon].close - from) / from;
    count += 1;
  }
  return medianOfScratch(scratch, count);
}

/** Median forward return over the resampled path's occurrences of a pattern. */
export function conditionalMedianFast(
  bars: readonly DailyBar[],
  triggers: readonly number[],
  horizon: number,
  scratch: Float64Array,
): number | null {
  let count = 0;
  for (const t of triggers) {
    const target = t + horizon;
    if (target >= bars.length) continue;
    const from = bars[t].close;
    if (from === 0) continue;
    scratch[count] = (bars[target].close - from) / from;
    count += 1;
  }
  return medianOfScratch(scratch, count);
}
