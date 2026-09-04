import type { DailyBar } from "@/market/types";
import { figure, formatCount, formatSignedPercent } from "./formatting";
import { triggerIndices, type PatternDetector } from "./pattern-detectors";
import {
  HORIZONS,
  SMALL_SAMPLE_THRESHOLD,
  smallSampleWarning,
} from "./pattern-sample-size";
import { nonOverlappingCount } from "./pattern-uncertainty";
import { forwardReturn, median } from "./price-series";
import type { Figure } from "./types";
import {
  REGIMES,
  REGIME_LABELS,
  REGIME_LOOKBACK_SESSIONS,
  partitionByRegime,
  regimeCuts,
  trailingVolatility,
  type Regime,
  type RegimeCuts,
} from "./volatility-regime";

export interface RegimeStat {
  regime: Regime;
  horizon: number;
  medianReturn: number | null;
  sampleSize: number;
  nonOverlappingSampleSize: number;
  smallSampleWarning: string | null;
}

export interface RegimeContext {
  volatility: (number | null)[];
  cuts: RegimeCuts;
}

/**
 * The volatility reading at every bar and the terciles cut from it. Computed
 * once per report and handed to each detector: recomputing it five times would
 * re-measure the same series for no new information.
 */
export function regimeContext(bars: readonly DailyBar[]): RegimeContext | null {
  const volatility = trailingVolatility(bars);
  const cuts = regimeCuts(volatility);
  return cuts === null ? null : { volatility, cuts };
}

/**
 * The same median, computed separately inside each volatility tercile of this
 * ticker's own history (v1.1 S1). No interval: these are point estimates over
 * thinner samples, and the non-overlapping count is what says how thin.
 */
export function regimeStats(
  detector: PatternDetector,
  bars: readonly DailyBar[],
  context: RegimeContext | null = regimeContext(bars),
): RegimeStat[] {
  if (context === null) return [];
  const { volatility, cuts } = context;

  const triggers = triggerIndices(detector, bars);
  const out: RegimeStat[] = [];
  for (const horizon of HORIZONS) {
    const withWindow = triggers.filter(
      (t) => forwardReturn(bars, t, horizon) !== null,
    );
    const { byRegime } = partitionByRegime(withWindow, volatility, cuts);
    for (const regime of REGIMES) {
      const occurrences = byRegime[regime];
      const returns = occurrences
        .map((t) => forwardReturn(bars, t, horizon))
        .filter((r): r is number => r !== null);
      const independent = nonOverlappingCount(occurrences, horizon);
      out.push({
        regime,
        horizon,
        medianReturn: median(returns),
        sampleSize: occurrences.length,
        nonOverlappingSampleSize: independent,
        smallSampleWarning:
          independent < SMALL_SAMPLE_THRESHOLD ? smallSampleWarning(independent) : null,
      });
    }
  }
  return out;
}

/** `+0.58% · 40 (35)` — median, then N and the non-overlapping count. */
function regimeValue(stat: RegimeStat): string {
  const point =
    stat.medianReturn === null ? "—" : formatSignedPercent(stat.medianReturn * 100);
  return `${point} · ${formatCount(stat.sampleSize)} (${formatCount(
    stat.nonOverlappingSampleSize,
  )})`;
}

export const REGIME_NOTE =
  "Under each horizon, the three volatility rows split the same occurrences by " +
  `the tercile of this ticker's trailing ${REGIME_LOOKBACK_SESSIONS}-session ` +
  "realized volatility that each one began in. They read median · N " +
  "(non-overlapping). Occurrences from the opening sessions, before a full " +
  "volatility window exists, belong to no tercile and are not counted in any " +
  "of the three. These rows carry no interval.";

/** The rows check 5 renders under one pattern's horizon block. */
export function regimeFigures(
  label: string,
  horizon: number,
  stats: readonly RegimeStat[],
): Figure[] {
  const figures: Figure[] = [];
  for (const stat of stats.filter((r) => r.horizon === horizon)) {
    figures.push(
      figure(
        `${label} — ${horizon}-session, ${REGIME_LABELS[stat.regime]}`,
        regimeValue(stat),
        stat.medianReturn === null ? undefined : stat.medianReturn * 100,
      ),
    );
    if (stat.smallSampleWarning) {
      figures.push(
        figure(
          `${label} — ${horizon}-session, ${REGIME_LABELS[stat.regime]} sample`,
          stat.smallSampleWarning,
        ),
      );
    }
  }
  return figures;
}
