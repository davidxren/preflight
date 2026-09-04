import type { DailyBar } from "@/market/types";

/**
 * The five candlestick/price detectors (CLAUDE.md §12), hand-rolled. The
 * maintained TA libraries dropped pattern detection, and these conditions are
 * specified exactly, so each is transcribed literally from the specification.
 *
 * Every detector takes the whole series and the index `t` of the day being
 * tested, and reports whether the pattern triggers on that day.
 */

export interface PatternDetector {
  id: string;
  label: string;
  /** Bars of history required before `t`, so `t - lookback` is always valid. */
  lookback: number;
  /**
   * The trigger condition, exactly as specified. Carried on the detector so
   * the methodology page states the same definition the code implements
   * rather than a second copy that could drift from it.
   */
  definition: string;
  triggers: (bars: readonly DailyBar[], t: number) => boolean;
}

/** C[t-1] < O[t-1] and C[t] > O[t] and O[t] <= C[t-1] and C[t] >= O[t-1]. */
function bullishEngulfing(bars: readonly DailyBar[], t: number): boolean {
  const prior = bars[t - 1];
  const today = bars[t];
  return (
    prior.close < prior.open &&
    today.close > today.open &&
    today.open <= prior.close &&
    today.close >= prior.open
  );
}

/** lowerWick >= 2*body and upperWick <= body and body <= 0.4*range. */
function hammer(bars: readonly DailyBar[], t: number): boolean {
  const { open, high, low, close } = bars[t];
  const range = high - low;
  if (!(range > 0)) return false;
  const body = Math.abs(close - open);
  const lowerWick = Math.min(open, close) - low;
  const upperWick = high - Math.max(open, close);
  return lowerWick >= 2 * body && upperWick <= body && body <= 0.4 * range;
}

/** C[t] > max(H[t-20 .. t-1]). */
function twentyDayHighBreakout(bars: readonly DailyBar[], t: number): boolean {
  let highest = -Infinity;
  for (let i = t - 20; i <= t - 1; i += 1) {
    if (bars[i].high > highest) highest = bars[i].high;
  }
  return bars[t].close > highest;
}

/** O[t] >= C[t-1] * 1.04. */
function gapUp(bars: readonly DailyBar[], t: number): boolean {
  return bars[t].open >= bars[t - 1].close * 1.04;
}

/** C[t] > C[t-1] and C[t-1] > C[t-2] and C[t-2] > C[t-3]. */
function threeUpCloses(bars: readonly DailyBar[], t: number): boolean {
  return (
    bars[t].close > bars[t - 1].close &&
    bars[t - 1].close > bars[t - 2].close &&
    bars[t - 2].close > bars[t - 3].close
  );
}

export const PATTERN_DETECTORS: readonly PatternDetector[] = [
  {
    id: "bullish-engulfing",
    label: "Bullish engulfing",
    lookback: 1,
    definition: "C[t-1] < O[t-1] and C[t] > O[t] and O[t] <= C[t-1] and C[t] >= O[t-1]",
    triggers: bullishEngulfing,
  },
  {
    id: "hammer",
    label: "Hammer",
    lookback: 0,
    definition: "lowerWick >= 2*body and upperWick <= body and body <= 0.4*range",
    triggers: hammer,
  },
  {
    id: "twenty-day-high-breakout",
    label: "20-day-high breakout close",
    lookback: 20,
    definition: "C[t] > max(H[t-20 .. t-1])",
    triggers: twentyDayHighBreakout,
  },
  {
    id: "gap-up-4pct",
    label: "Gap up 4% or more",
    lookback: 1,
    definition: "O[t] >= C[t-1] * 1.04",
    triggers: gapUp,
  },
  {
    id: "three-up-closes",
    label: "Three consecutive up closes",
    lookback: 3,
    definition: "C[t] > C[t-1] and C[t-1] > C[t-2] and C[t-2] > C[t-3]",
    triggers: threeUpCloses,
  },
] as const;

/** Indices of every day in `bars` on which `detector` triggers. */
export function triggerIndices(
  detector: PatternDetector,
  bars: readonly DailyBar[],
): number[] {
  const out: number[] = [];
  for (let t = detector.lookback; t < bars.length; t += 1) {
    if (detector.triggers(bars, t)) out.push(t);
  }
  return out;
}

/**
 * The same scan, written into a caller-owned buffer, returning how many
 * indices were written. The bootstrap runs this ten thousand times and the
 * throwaway arrays cost more than the scan itself; nothing else needs it.
 */
export function triggerIndicesInto(
  detector: PatternDetector,
  bars: readonly DailyBar[],
  out: Int32Array,
): number {
  let count = 0;
  for (let t = detector.lookback; t < bars.length; t += 1) {
    if (detector.triggers(bars, t)) {
      out[count] = t;
      count += 1;
    }
  }
  return count;
}
