import type { DailyBar } from "@/market/types";

/**
 * Statistics over a daily close series. Shared by the chasing flag (check 3)
 * and the pattern base rates (check 5) so both read the same numbers from the
 * same history.
 */

/** Linear-interpolation-free median: the mean of the two middle values. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Share of `values` strictly greater than zero, in percentage points. */
export function percentPositive(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return (values.filter((v) => v > 0).length / values.length) * 100;
}

/**
 * Forward return from bar `index` over `horizon` sessions, as a fraction.
 * Returns null when the forward window runs past the end of the series, so a
 * truncated window can never be counted as a result.
 */
export function forwardReturn(
  bars: readonly DailyBar[],
  index: number,
  horizon: number,
): number | null {
  const target = index + horizon;
  if (target >= bars.length) return null;
  const from = bars[index].close;
  if (from === 0) return null;
  return (bars[target].close - from) / from;
}

/** Every forward return over `horizon` that has a complete window. */
export function allForwardReturns(
  bars: readonly DailyBar[],
  horizon: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i + horizon < bars.length; i += 1) {
    const r = forwardReturn(bars, i, horizon);
    if (r !== null) out.push(r);
  }
  return out;
}

/**
 * Trailing return over `lookback` sessions ending at the last bar, as a
 * fraction. Null when the history is too short to cover the window.
 */
export function trailingReturn(
  bars: readonly DailyBar[],
  lookback: number,
): number | null {
  if (bars.length < lookback + 1) return null;
  const from = bars[bars.length - 1 - lookback].close;
  if (from === 0) return null;
  return (bars[bars.length - 1].close - from) / from;
}

/** Every historical trailing return over `lookback`, as fractions. */
export function allTrailingReturns(
  bars: readonly DailyBar[],
  lookback: number,
): number[] {
  const out: number[] = [];
  for (let i = lookback; i < bars.length; i += 1) {
    const from = bars[i - lookback].close;
    if (from === 0) continue;
    out.push((bars[i].close - from) / from);
  }
  return out;
}

/**
 * Share of `population` at or below `value`, in percentage points. Used to
 * place today's run-up against the ticker's own history rather than against a
 * threshold picked out of the air.
 */
export function percentileRank(
  population: readonly number[],
  value: number,
): number | null {
  if (population.length === 0) return null;
  const atOrBelow = population.filter((v) => v <= value).length;
  return (atOrBelow / population.length) * 100;
}
