import type { DailyBar, MarketSnapshot } from "@/market/types";
import { PATTERN_SOURCE_NOTE } from "./citations";
import {
  benjaminiHochberg,
  multiplicitySentence,
  FALSE_DISCOVERY_RATE,
} from "./false-discovery";
import {
  figure,
  formatCount,
  formatPercent,
  formatSignedPercent,
  unavailable,
} from "./formatting";
import { PATTERN_DETECTORS, triggerIndices, type PatternDetector } from "./pattern-detectors";
import {
  nonOverlappingCount,
  patternUncertainty,
  type Interval,
  type UncertainStat,
} from "./pattern-uncertainty";
import {
  allForwardReturns,
  forwardReturn,
  median,
  percentPositive,
} from "./price-series";
import {
  REGIME_NOTE,
  regimeContext,
  regimeFigures,
  regimeStats,
} from "./pattern-regimes";
import {
  HORIZONS,
  SMALL_SAMPLE_THRESHOLD,
  smallSampleWarning,
} from "./pattern-sample-size";

// Re-exported because it is check 5's wording, and the check is where callers
// and tests look for it.
export { smallSampleWarning };
import type { CheckResult, Figure } from "./types";

/**
 * Check 5 — what actually followed each pattern in this ticker's own history,
 * next to the unconditional base rate over the same series, and with the
 * uncertainty around both (v1.1 D2). The comparison is the point: a pattern
 * that "works" 55% of the time says little if the series closes up 55% of the
 * time regardless, and less still if the interval around 55% is wide.
 */


export interface HorizonStats {
  horizon: number;
  percentPositive: number | null;
  medianReturn: number | null;
  unconditionalMedian: number | null;
  /** Triggers with a complete forward window at this horizon. */
  sampleSize: number;
  /** Triggers left once overlapping forward windows are removed. */
  nonOverlappingSampleSize: number;
}

export interface PatternBaseRate {
  id: string;
  label: string;
  /** Triggers with a complete forward window at the longest horizon reported. */
  sampleSize: number;
  /**
   * The smallest non-overlapping count across the horizons reported, which is
   * the number of genuinely independent observations behind the thinnest of
   * this pattern's statistics. The small-sample warning keys off it.
   */
  independentSampleSize: number;
  horizons: HorizonStats[];
  smallSampleWarning: string | null;
}

function statsFor(
  bars: readonly DailyBar[],
  triggers: readonly number[],
  horizon: number,
): HorizonStats {
  const returns: number[] = [];
  const withWindow: number[] = [];
  for (const t of triggers) {
    const r = forwardReturn(bars, t, horizon);
    if (r !== null) {
      returns.push(r);
      withWindow.push(t);
    }
  }
  return {
    horizon,
    percentPositive: percentPositive(returns),
    medianReturn: median(returns),
    unconditionalMedian: median(allForwardReturns(bars, horizon)),
    sampleSize: withWindow.length,
    nonOverlappingSampleSize: nonOverlappingCount(withWindow, horizon),
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
  const independentSampleSize = Math.min(
    ...horizons.map((h) => h.nonOverlappingSampleSize),
  );
  return {
    id: detector.id,
    label: detector.label,
    sampleSize,
    independentSampleSize,
    horizons,
    smallSampleWarning:
      independentSampleSize < SMALL_SAMPLE_THRESHOLD
        ? smallSampleWarning(independentSampleSize)
        : null,
  };
}

export function patternBaseRates(bars: readonly DailyBar[]): PatternBaseRate[] {
  return PATTERN_DETECTORS.map((d) => patternBaseRate(d, bars));
}

/** `+0.53% [−0.32%, +1.33%]`, or the bare figure when no interval was usable. */
function withInterval(value: number, interval: Interval | null): string {
  const point = formatSignedPercent(value * 100);
  if (!interval) return point;
  const low = formatSignedPercent(interval.low * 100);
  const high = formatSignedPercent(interval.high * 100);
  return `${point} [${low}, ${high}]`;
}

function statFor(
  stats: readonly UncertainStat[],
  id: string,
  horizon: number,
): UncertainStat | undefined {
  return stats.find((s) => s.detectorId === id && s.horizon === horizon);
}

function horizonFigures(
  rate: PatternBaseRate,
  h: HorizonStats,
  stat: UncertainStat | undefined,
): Figure[] {
  const figures: Figure[] = [];
  const prefix = `${rate.label} — ${h.horizon}-session`;

  figures.push(
    figure(
      `${prefix} triggers (N)`,
      `${formatCount(h.sampleSize)} (${formatCount(h.nonOverlappingSampleSize)} non-overlapping)`,
      h.sampleSize,
    ),
  );

  if (h.percentPositive === null || h.medianReturn === null) {
    figures.push(
      unavailable(
        `${prefix} forward return`,
        "No trigger had a complete forward window in the loaded history.",
      ),
    );
    return figures;
  }

  figures.push(
    figure(`${prefix} forward positive`, formatPercent(h.percentPositive, 1), h.percentPositive),
  );

  if (stat?.unavailableReason) {
    figures.push(
      figure(
        `${prefix} forward median`,
        formatSignedPercent(h.medianReturn * 100),
        h.medianReturn * 100,
      ),
    );
    figures.push(unavailable(`${prefix} interval`, stat.unavailableReason));
    figures.push(unavailable(`${prefix} vs unconditional`, stat.unavailableReason));
  } else {
    figures.push(
      figure(
        `${prefix} forward median`,
        withInterval(h.medianReturn, stat?.medianInterval ?? null),
        h.medianReturn * 100,
      ),
    );
    if (stat?.observedDifference !== null && stat?.observedDifference !== undefined) {
      figures.push(
        figure(
          `${prefix} vs unconditional`,
          withInterval(stat.observedDifference, stat.differenceInterval),
          stat.observedDifference * 100,
        ),
      );
    }
  }

  if (h.unconditionalMedian !== null) {
    figures.push(
      figure(
        `Unconditional ${h.horizon}-session median`,
        formatSignedPercent(h.unconditionalMedian * 100),
        h.unconditionalMedian * 100,
      ),
    );
  }
  return figures;
}

const METHOD_NOTE =
  "Triggers overlap: two occurrences a few sessions apart share most of a " +
  "20-session outcome, so N overstates how many independent observations " +
  "there are. The non-overlapping count keeps an occurrence only when the " +
  "previous kept one's forward window has closed. Intervals are 2.5th and " +
  "97.5th percentiles over 2,000 stationary block-bootstrap resamples of the " +
  "series, with geometric block lengths averaging 20 sessions, rebuilt into a " +
  "price path and re-measured with the same detectors.";

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
  const stats = patternUncertainty(bars);
  const figures: Figure[] = [];
  let anyRegimeRows = false;
  // Measured once for the whole report rather than once per detector.
  const regimes0 = regimeContext(bars);
  for (const rate of rates) {
    const detector = PATTERN_DETECTORS.find((d) => d.id === rate.id)!;
    const regimes = regimeStats(detector, bars, regimes0);
    for (const h of rate.horizons) {
      figures.push(...horizonFigures(rate, h, statFor(stats, rate.id, h.horizon)));
      const rows = regimeFigures(rate.label, h.horizon, regimes);
      if (rows.length > 0) anyRegimeRows = true;
      figures.push(...rows);
    }
    if (rate.smallSampleWarning) figures.push(figure(rate.label, rate.smallSampleWarning));
  }

  const fdr = benjaminiHochberg(
    stats.map((s) => s.pValue),
    FALSE_DISCOVERY_RATE,
  );
  const adjustment = multiplicitySentence(fdr.tested, fdr.rejected.length);
  figures.push(figure("Statistics that survive the adjustment", adjustment));

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
  notes.push(METHOD_NOTE);
  if (anyRegimeRows) notes.push(REGIME_NOTE);
  notes.push(
    `${adjustment}. The adjustment holds the false-discovery rate across those ` +
      "statistics to 5%; it describes this sample and says nothing about what " +
      "follows next.",
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
