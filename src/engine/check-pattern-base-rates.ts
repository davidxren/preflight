import type { DailyBar, MarketSnapshot } from "@/market/types";
import { PATTERN_SOURCE_NOTE } from "./citations";
import {
  figure,
  formatCount,
  formatPercent,
  formatSignedPercent,
  unavailable,
} from "./formatting";
import { PATTERN_DETECTORS, triggerIndices, type PatternDetector } from "./pattern-detectors";
import {
  allForwardReturns,
  forwardReturn,
  median,
  percentPositive,
} from "./price-series";
import type { CheckResult } from "./types";

/**
 * Check 5 — what actually followed each pattern in this ticker's own history,
 * next to the unconditional base rate over the same series. The comparison is
 * the point: a pattern that "works" 55% of the time says little if the series
 * closes up 55% of the time regardless.
 */

/** Below this many triggers the numbers are too thin to read, per §12. */
const SMALL_SAMPLE_THRESHOLD = 30;
const HORIZONS = [5, 20] as const;

export interface HorizonStats {
  horizon: number;
  percentPositive: number | null;
  medianReturn: number | null;
  unconditionalMedian: number | null;
}

export interface PatternBaseRate {
  id: string;
  label: string;
  /** Triggers with a complete forward window at every horizon reported. */
  sampleSize: number;
  horizons: HorizonStats[];
  smallSampleWarning: string | null;
}

/** The exact wording required by §12 when a sample is thin. */
export function smallSampleWarning(n: number): string {
  return `Small sample — read with caution (N=${n})`;
}

function statsFor(
  bars: readonly DailyBar[],
  triggers: readonly number[],
  horizon: number,
): HorizonStats {
  const returns: number[] = [];
  for (const t of triggers) {
    const r = forwardReturn(bars, t, horizon);
    if (r !== null) returns.push(r);
  }
  return {
    horizon,
    percentPositive: percentPositive(returns),
    medianReturn: median(returns),
    unconditionalMedian: median(allForwardReturns(bars, horizon)),
  };
}

export function patternBaseRate(
  detector: PatternDetector,
  bars: readonly DailyBar[],
): PatternBaseRate {
  const triggers = triggerIndices(detector, bars);
  const horizons = HORIZONS.map((h) => statsFor(bars, triggers, h));
  // N is reported against the longest horizon, because that is the smallest
  // set of triggers with a complete forward window and so the honest count.
  const longest = Math.max(...HORIZONS);
  const sampleSize = triggers.filter(
    (t) => forwardReturn(bars, t, longest) !== null,
  ).length;
  return {
    id: detector.id,
    label: detector.label,
    sampleSize,
    horizons,
    smallSampleWarning:
      sampleSize < SMALL_SAMPLE_THRESHOLD ? smallSampleWarning(sampleSize) : null,
  };
}

export function patternBaseRates(bars: readonly DailyBar[]): PatternBaseRate[] {
  return PATTERN_DETECTORS.map((d) => patternBaseRate(d, bars));
}

export function checkPatternBaseRates(snapshot: MarketSnapshot): CheckResult {
  const notes: string[] = [];
  const bars = snapshot.bars;

  if (bars.length < 41) {
    const reason =
      snapshot.unavailable.bars ??
      `The loaded history has ${bars.length} bars, too few to measure a ` +
        "20-session forward return after a pattern.";
    return {
      number: 5,
      title: "Pattern base rates in this ticker's own history",
      summary: "Pattern base rates could not be computed.",
      figures: PATTERN_DETECTORS.map((d) => unavailable(d.label, reason)),
      notes,
      citation: PATTERN_SOURCE_NOTE,
    };
  }

  const rates = patternBaseRates(bars);
  const figures = [];
  for (const rate of rates) {
    figures.push(figure(`${rate.label} — triggers (N)`, formatCount(rate.sampleSize), rate.sampleSize));
    for (const h of rate.horizons) {
      const suffix = `${rate.label} — ${h.horizon}-session forward`;
      if (h.percentPositive === null || h.medianReturn === null) {
        figures.push(
          unavailable(
            `${suffix} return`,
            "No trigger had a complete forward window in the loaded history.",
          ),
        );
        continue;
      }
      figures.push(
        figure(`${suffix} positive`, formatPercent(h.percentPositive, 1), h.percentPositive),
      );
      figures.push(
        figure(
          `${suffix} median`,
          formatSignedPercent(h.medianReturn * 100),
          h.medianReturn * 100,
        ),
      );
      if (h.unconditionalMedian !== null) {
        figures.push(
          figure(
            `Unconditional ${h.horizon}-session median`,
            formatSignedPercent(h.unconditionalMedian * 100),
            h.unconditionalMedian * 100,
          ),
        );
      }
    }
    if (rate.smallSampleWarning) figures.push(figure(rate.label, rate.smallSampleWarning));
  }

  const firstBar = bars[0].date;
  const lastBar = bars[bars.length - 1].date;
  notes.push(
    `Measured over ${formatCount(bars.length)} daily bars, ${firstBar} to ${lastBar}. ` +
      "Forward return is (close at t+k − close at t) ÷ close at t.",
  );
  notes.push(
    "Each pattern's numbers sit next to the unconditional median over the " +
      "same series, which is what the series did on an average day.",
  );

  return {
    number: 5,
    title: "Pattern base rates in this ticker's own history",
    summary:
      `Five patterns were measured over ${formatCount(bars.length)} daily bars ` +
      `from ${firstBar} to ${lastBar}, each against the unconditional base rate.`,
    figures,
    notes,
    citation: PATTERN_SOURCE_NOTE,
  };
}
