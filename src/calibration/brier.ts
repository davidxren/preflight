/**
 * Brier scoring for the calibration practice mode. This scores the reader's
 * own forecasts against what the price did; it says nothing about the ticker
 * and is kept entirely outside the six checks.
 */

export type Direction = "up" | "down";

/**
 * The probability the forecaster assigned to "up". A "down" call at 70%
 * confidence is a 30% chance of "up", which is what the score is computed on.
 */
export function probabilityOfUp(
  direction: Direction,
  confidence: number,
): number {
  return direction === "up" ? confidence : 1 - confidence;
}

/** Squared error of one forecast. 0 is a perfect call, 1 is perfectly wrong. */
export function brierTerm(probabilityUp: number, wentUp: boolean): number {
  return (probabilityUp - (wentUp ? 1 : 0)) ** 2;
}

export interface ResolvedForecast {
  probabilityUp: number;
  wentUp: boolean;
}

export interface CalibrationSummary {
  resolved: number;
  /** Mean squared error over resolved forecasts; null when none have resolved. */
  brierScore: number | null;
  /**
   * The score a forecaster gets by always predicting the observed base rate.
   * Shown beside the score so the number has something to be read against.
   */
  baseRateBrier: number | null;
  /** Share of resolved forecasts whose window closed higher. */
  observedUpRate: number | null;
}

export function summarize(
  forecasts: readonly ResolvedForecast[],
): CalibrationSummary {
  if (forecasts.length === 0) {
    return {
      resolved: 0,
      brierScore: null,
      baseRateBrier: null,
      observedUpRate: null,
    };
  }
  const total = forecasts.reduce(
    (sum, f) => sum + brierTerm(f.probabilityUp, f.wentUp),
    0,
  );
  const ups = forecasts.filter((f) => f.wentUp).length;
  const upRate = ups / forecasts.length;
  return {
    resolved: forecasts.length,
    brierScore: total / forecasts.length,
    // Always forecasting the base rate p yields p(1−p) in expectation.
    baseRateBrier: upRate * (1 - upRate),
    observedUpRate: upRate,
  };
}
