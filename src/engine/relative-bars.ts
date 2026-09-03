import type { DailyBar } from "@/market/types";

/**
 * Bars expressed relative to the prior close, which is the sequence the block
 * bootstrap resamples (v1.1 D2). Resampling prices directly would splice
 * unrelated price levels together; resampling ratios and rebuilding a path
 * keeps every session's own shape — its gap, its range, its body — intact,
 * which is what the five detectors read.
 */

export interface RelativeBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * One relative bar per session after the first, each component divided by the
 * prior close. Sessions with a non-positive prior close are dropped: a ratio
 * against them is not defined, and inventing one would be a fabricated number.
 */
export function toRelativeBars(bars: readonly DailyBar[]): RelativeBar[] {
  const out: RelativeBar[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prior = bars[i - 1].close;
    if (!(prior > 0)) continue;
    const bar = bars[i];
    out.push({
      open: bar.open / prior,
      high: bar.high / prior,
      low: bar.low / prior,
      close: bar.close / prior,
    });
  }
  return out;
}

/**
 * A reusable buffer of bars, allocated once and rewritten in place for each
 * resample. Two thousand resamples over a decade of history would otherwise
 * allocate several million short-lived objects.
 *
 * Dates and volumes are placeholders: no detector and no forward return reads
 * either, and a synthetic date would be a number the report never states.
 */
export function barBuffer(length: number): DailyBar[] {
  const buffer: DailyBar[] = new Array(length);
  for (let i = 0; i < length; i += 1) {
    buffer[i] = { date: "", open: 0, high: 0, low: 0, close: 0, volume: 0 };
  }
  return buffer;
}

/**
 * Rebuilds a price path into `buffer` by compounding `order`'s relative bars
 * from `startClose`. `order` holds indices into `relatives`, so the caller
 * chooses the resampling scheme.
 */
export function rebuildPath(
  buffer: DailyBar[],
  relatives: readonly RelativeBar[],
  order: Int32Array,
  startClose: number,
): void {
  let priorClose = startClose;
  for (let i = 0; i < order.length; i += 1) {
    const r = relatives[order[i]];
    const bar = buffer[i];
    bar.open = priorClose * r.open;
    bar.high = priorClose * r.high;
    bar.low = priorClose * r.low;
    bar.close = priorClose * r.close;
    priorClose = bar.close;
  }
}
