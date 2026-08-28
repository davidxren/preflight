import { seededRandom } from "./seeded-random";
import type { SizingInputs } from "./types";

/**
 * Fixed-fractional position sizing math (CLAUDE.md §11). Pure and seeded, so
 * the same inputs always produce the same figures.
 */

/** Trades simulated per path, fixed by the specification. */
export const TRADE_COUNT = 50;
/** Paths per simulation; fixed so the reported probability is reproducible. */
export const PATH_COUNT = 10_000;
/** Any fixed value works; it is pinned so results never drift between runs. */
export const SIMULATION_SEED = 20260828;

export const RISK_ASSUMPTIONS: string =
  "Assumes independent trades, fixed fractional sizing, constant win " +
  "probability and payoff ratio, and no fees or slippage. Real results differ.";

/** Kelly fraction f* = p − (1−p)/b. Null when the payoff ratio is unusable. */
export function kellyFraction(
  winProbability: number,
  payoffRatio: number,
): number | null {
  if (!Number.isFinite(winProbability) || !Number.isFinite(payoffRatio)) {
    return null;
  }
  if (payoffRatio <= 0) return null;
  return winProbability - (1 - winProbability) / payoffRatio;
}

export interface RuinResult {
  /** Probability of touching the ruin threshold, as a fraction of paths. */
  probability: number;
  /** Equity level that counts as ruin. */
  threshold: number;
  paths: number;
  trades: number;
}

/** Inputs that would make the simulation meaningless, named for the report. */
export function validateSizingInputs(problem: SizingInputs): string | null {
  const { equity, riskFraction, winProbability, payoffRatio, riskBudgetFraction } =
    problem;
  if (!(equity > 0)) return "Account equity must be greater than zero.";
  if (!(riskFraction > 0 && riskFraction <= 1)) {
    return "Risk per trade must be greater than 0 and at most 1.";
  }
  if (!(winProbability >= 0 && winProbability <= 1)) {
    return "Win rate must be between 0 and 1.";
  }
  if (!(payoffRatio > 0)) return "Payoff ratio must be greater than zero.";
  if (!(riskBudgetFraction > 0 && riskBudgetFraction <= 1)) {
    return "Risk budget must be greater than 0 and at most 1 of equity.";
  }
  return null;
}

/**
 * Seeded Monte Carlo over `PATH_COUNT` paths of `TRADE_COUNT` fixed-fraction
 * trades. Ruin is touching or falling below the threshold at any point, so a
 * path that recovers still counts as ruined.
 */
export function riskOfRuin(
  problem: SizingInputs,
  options: { paths?: number; trades?: number; seed?: number } = {},
): RuinResult {
  const paths = options.paths ?? PATH_COUNT;
  const trades = options.trades ?? TRADE_COUNT;
  const seed = options.seed ?? SIMULATION_SEED;
  const { equity, riskFraction, winProbability, payoffRatio } = problem;
  const threshold = equity * (1 - problem.riskBudgetFraction);

  const random = seededRandom(seed);
  let ruined = 0;
  for (let path = 0; path < paths; path += 1) {
    let balance = equity;
    for (let trade = 0; trade < trades; trade += 1) {
      balance +=
        random() < winProbability
          ? riskFraction * payoffRatio * balance
          : -riskFraction * balance;
      if (balance <= threshold) {
        ruined += 1;
        break;
      }
    }
  }

  return { probability: ruined / paths, threshold, paths, trades };
}
