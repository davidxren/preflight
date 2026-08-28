import type { PredictionRow } from "@/db/schema";
import type { DailyBar } from "@/market/types";
import {
  probabilityOfUp,
  summarize,
  type CalibrationSummary,
  type Direction,
  type ResolvedForecast,
} from "./brier";
import { HORIZON_SESSIONS, markResolved, predictionsFor } from "./prediction-store";

/**
 * Lazy resolution: a forecast settles the first time later price data reaches
 * its resolve-after date. Nothing runs on a timer, and a forecast whose window
 * is still open stays pending rather than being scored early.
 */

/** The first bar on or after `resolveAfter`, or null while none has printed. */
export function settlingBar(
  bars: readonly DailyBar[],
  resolveAfter: string,
): DailyBar | null {
  for (const bar of bars) {
    if (bar.date >= resolveAfter) return bar;
  }
  return null;
}

/** A flat close is not a rise, so it settles against an "up" call. */
export function outcomeOf(baseClose: number, settledClose: number): Direction {
  return settledClose > baseClose ? "up" : "down";
}

export interface CalibrationView extends CalibrationSummary {
  pending: number;
  horizonSessions: number;
}

/**
 * Settles what can be settled from `bars` and returns the visitor's summary.
 * `bars` covers one symbol, so only that symbol's forecasts settle here.
 */
export function resolveAndSummarize(
  visitorId: string,
  symbol: string,
  bars: readonly DailyBar[],
): CalibrationView {
  const rows = predictionsFor(visitorId);
  const settled: PredictionRow[] = [];

  for (const row of rows) {
    if (row.outcome !== null) {
      settled.push(row);
      continue;
    }
    if (row.symbol !== symbol.toUpperCase()) continue;
    const bar = settlingBar(bars, row.resolveAfter);
    if (!bar) continue;
    const outcome = outcomeOf(row.baseClose, bar.close);
    markResolved(row.id, outcome);
    settled.push({ ...row, outcome });
  }

  const forecasts: ResolvedForecast[] = settled.map((row) => ({
    probabilityUp: probabilityOfUp(row.direction, row.confidence),
    wentUp: row.outcome === "up",
  }));

  return {
    ...summarize(forecasts),
    pending: rows.length - settled.length,
    horizonSessions: HORIZON_SESSIONS,
  };
}
