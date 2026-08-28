import type { MarketSnapshot } from "@/market/types";
import { CITATIONS } from "./citations";
import {
  figure,
  formatPercent,
  formatSignedPercent,
  unavailable,
} from "./formatting";
import {
  allTrailingReturns,
  percentileRank,
  trailingReturn,
} from "./price-series";
import type { CheckResult } from "./types";

/**
 * Check 3 — is this ticker one of today's top movers, and has it already run
 * up. The run-up condition is stated on the report rather than hidden, and it
 * is measured against the ticker's own ten-year distribution instead of a
 * threshold picked out of the air.
 */

/** A 20-session return at or above this percentile of its own history. */
const RUN_UP_PERCENTILE = 90;
const RUN_UP_LOOKBACK = 20;

export interface ChasingSignals {
  onDayGainers: boolean | null;
  twentyDayReturn: number | null;
  twentyDayPercentile: number | null;
  ranUp: boolean | null;
}

export function chasingSignals(snapshot: MarketSnapshot): ChasingSignals {
  const onDayGainers = snapshot.dayGainers
    ? snapshot.dayGainers.some(
        (s) => s.toUpperCase() === snapshot.symbol.toUpperCase(),
      )
    : null;
  const twentyDayReturn = trailingReturn(snapshot.bars, RUN_UP_LOOKBACK);
  const twentyDayPercentile =
    twentyDayReturn === null
      ? null
      : percentileRank(
          allTrailingReturns(snapshot.bars, RUN_UP_LOOKBACK),
          twentyDayReturn,
        );
  const ranUp =
    twentyDayPercentile === null
      ? null
      : twentyDayPercentile >= RUN_UP_PERCENTILE;
  return { onDayGainers, twentyDayReturn, twentyDayPercentile, ranUp };
}

export function checkTopMover(snapshot: MarketSnapshot): CheckResult {
  const signals = chasingSignals(snapshot);
  const figures = [];
  const notes: string[] = [];
  const summaryParts: string[] = [];

  if (signals.onDayGainers === null) {
    const reason =
      snapshot.unavailable.dayGainers ??
      "The day-gainers screen was not present in the loaded data.";
    figures.push(unavailable("On today's day-gainers screen", reason));
    summaryParts.push("Whether this ticker is a top daily gainer could not be read.");
  } else {
    figures.push(
      figure(
        "On today's day-gainers screen",
        signals.onDayGainers ? "Yes" : "No",
      ),
    );
    summaryParts.push(
      signals.onDayGainers
        ? `${snapshot.symbol} is on today's day-gainers screen.`
        : `${snapshot.symbol} is not on today's day-gainers screen.`,
    );
  }

  for (const lookback of [1, 5, 20] as const) {
    const r = trailingReturn(snapshot.bars, lookback);
    const label = `Trailing ${lookback}-session return`;
    if (r === null) {
      figures.push(
        unavailable(
          label,
          `The loaded history has fewer than ${lookback + 1} bars.`,
        ),
      );
    } else {
      figures.push(figure(label, formatSignedPercent(r * 100), r * 100));
    }
  }

  if (signals.twentyDayPercentile !== null && signals.twentyDayReturn !== null) {
    figures.push(
      figure(
        "That 20-session return, as a percentile of its own history",
        formatPercent(signals.twentyDayPercentile, 1),
        signals.twentyDayPercentile,
      ),
    );
    figures.push(
      figure("Run-up condition met", signals.ranUp ? "Yes" : "No"),
    );
    summaryParts.push(
      `Its trailing 20-session return of ` +
        `${formatSignedPercent(signals.twentyDayReturn * 100)} sits at the ` +
        `${formatPercent(signals.twentyDayPercentile, 1)} percentile of the ` +
        "same measure over the loaded history.",
    );
  } else {
    figures.push(
      unavailable(
        "That 20-session return, as a percentile of its own history",
        "The loaded history has too few bars to rank a 20-session return.",
      ),
    );
  }

  notes.push(
    `The run-up condition is met when the trailing ${RUN_UP_LOOKBACK}-session ` +
      `return sits at or above the ${RUN_UP_PERCENTILE}th percentile of that ` +
      "same measure over the loaded history.",
  );

  return {
    number: 3,
    title: "Top mover and run-up",
    summary: summaryParts.join(" "),
    figures,
    notes,
    citation: CITATIONS[3],
  };
}
