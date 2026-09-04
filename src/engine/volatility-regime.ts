import type { DailyBar } from "@/market/types";

/**
 * Splits this ticker's own history into three volatility regimes (v1.1 S1), so
 * a pattern's base rate can be read separately in the calm, ordinary and
 * turbulent parts of its own past. The terciles are cut from this ticker's
 * series, not from a threshold chosen elsewhere.
 *
 * No interval accompanies these figures in this version; they are point
 * estimates over thinner samples than check 5's headline numbers, and the
 * non-overlapping count next to each is what says how thin.
 */

/** Sessions of trailing history each volatility reading is measured over. */
export const REGIME_LOOKBACK_SESSIONS = 60;

export const REGIMES = ["low", "middle", "high"] as const;
export type Regime = (typeof REGIMES)[number];

export const REGIME_LABELS: Readonly<Record<Regime, string>> = {
  low: "low volatility",
  middle: "middle volatility",
  high: "high volatility",
};

/**
 * Realized volatility at each bar: the standard deviation of the trailing 60
 * daily returns. Null until the window is complete — a shorter window would be
 * a different measurement wearing the same name.
 */
export function trailingVolatility(
  bars: readonly DailyBar[],
  lookback: number = REGIME_LOOKBACK_SESSIONS,
): (number | null)[] {
  const returns: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = 1; i < bars.length; i += 1) {
    const prior = bars[i - 1].close;
    if (prior > 0) returns[i] = (bars[i].close - prior) / prior;
  }

  const out: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = lookback; i < bars.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = i - lookback + 1; j <= i; j += 1) {
      const r = returns[j];
      if (r !== null) {
        sum += r;
        count += 1;
      }
    }
    if (count < lookback) continue;
    const mean = sum / count;
    let variance = 0;
    for (let j = i - lookback + 1; j <= i; j += 1) {
      const r = returns[j];
      if (r !== null) variance += (r - mean) ** 2;
    }
    out[i] = Math.sqrt(variance / (count - 1));
  }
  return out;
}

export interface RegimeCuts {
  /** Upper bound of the bottom tercile. */
  lower: number;
  /** Upper bound of the middle tercile. */
  upper: number;
}

/** The 33rd and 67th percentiles of the defined volatility readings. */
export function regimeCuts(volatility: readonly (number | null)[]): RegimeCuts | null {
  const defined = volatility.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (defined.length < 3) return null;
  const at = (fraction: number): number =>
    defined[Math.min(defined.length - 1, Math.floor(fraction * defined.length))];
  return { lower: at(1 / 3), upper: at(2 / 3) };
}

/**
 * The regime a bar sits in, or null where volatility is undefined — the first
 * sessions of the series, which belong to no tercile rather than to the
 * bottom one.
 */
export function regimeAt(
  volatility: readonly (number | null)[],
  index: number,
  cuts: RegimeCuts,
): Regime | null {
  const value = volatility[index];
  if (value === null || value === undefined) return null;
  if (value <= cuts.lower) return "low";
  if (value <= cuts.upper) return "middle";
  return "high";
}

/**
 * Partitions `indices` by regime. Every index with a defined volatility lands
 * in exactly one bucket; the rest are returned separately rather than being
 * quietly dropped into one.
 */
export function partitionByRegime(
  indices: readonly number[],
  volatility: readonly (number | null)[],
  cuts: RegimeCuts,
): { byRegime: Record<Regime, number[]>; undefinedRegime: number[] } {
  const byRegime: Record<Regime, number[]> = { low: [], middle: [], high: [] };
  const undefinedRegime: number[] = [];
  for (const index of indices) {
    const regime = regimeAt(volatility, index, cuts);
    if (regime === null) undefinedRegime.push(index);
    else byRegime[regime].push(index);
  }
  return { byRegime, undefinedRegime };
}
