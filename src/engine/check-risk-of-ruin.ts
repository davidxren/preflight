import { CITATIONS } from "./citations";
import {
  figure,
  formatDecimal,
  formatMoney,
  formatPercent,
  unavailable,
} from "./formatting";
import {
  RISK_ASSUMPTIONS,
  kellyFraction,
  riskOfRuin,
  validateSizingInputs,
} from "./risk-of-ruin";
import type { CheckResult, SizingInputs } from "./types";

/**
 * Check 4 — position sizing on hypothetical numbers the reader supplies. The
 * inputs live in memory for the length of the request and are never persisted
 * (CLAUDE.md §2.3). With no inputs the check reports that fact rather than
 * assuming numbers on the reader's behalf.
 */

const NO_INPUTS_REASON =
  "No sizing numbers were entered. These are never stored, so there is " +
  "nothing to reuse from a previous report.";

export function checkRiskOfRuin(inputs: SizingInputs | null): CheckResult {
  const figures = [];
  const notes: string[] = [RISK_ASSUMPTIONS];

  if (inputs === null) {
    figures.push(unavailable("Kelly fraction", NO_INPUTS_REASON));
    figures.push(unavailable("Risk of ruin over 50 trades", NO_INPUTS_REASON));
    return {
      number: 4,
      title: "Position sizing and risk of ruin",
      summary: "No sizing numbers were entered, so nothing was computed.",
      figures,
      notes,
      citation: CITATIONS[4],
    };
  }

  const invalid = validateSizingInputs(inputs);
  if (invalid) {
    figures.push(unavailable("Kelly fraction", invalid));
    figures.push(unavailable("Risk of ruin over 50 trades", invalid));
    return {
      number: 4,
      title: "Position sizing and risk of ruin",
      summary: "The sizing numbers entered could not be used.",
      figures,
      notes,
      citation: CITATIONS[4],
    };
  }

  const kelly = kellyFraction(inputs.winProbability, inputs.payoffRatio);
  const ruin = riskOfRuin(inputs);
  const summaryParts: string[] = [];

  figures.push(figure("Account equity", formatMoney(inputs.equity), inputs.equity));
  figures.push(
    figure(
      "Risk per trade",
      formatPercent(inputs.riskFraction * 100),
      inputs.riskFraction * 100,
    ),
  );
  figures.push(
    figure(
      "Win rate entered",
      formatPercent(inputs.winProbability * 100),
      inputs.winProbability * 100,
    ),
  );
  figures.push(
    figure("Payoff ratio entered", formatDecimal(inputs.payoffRatio, 2), inputs.payoffRatio),
  );

  if (kelly === null) {
    figures.push(
      unavailable("Kelly fraction", "The payoff ratio does not admit a Kelly fraction."),
    );
  } else {
    figures.push(figure("Kelly fraction f*", formatDecimal(kelly, 4), kelly));
    const exceeds = inputs.riskFraction > kelly;
    figures.push(
      figure("Risk per trade exceeds f*", exceeds ? "Yes" : "No"),
    );
    summaryParts.push(
      `The Kelly fraction for these numbers is ${formatDecimal(kelly, 4)}; the ` +
        `risk per trade entered, ${formatDecimal(inputs.riskFraction, 4)}, ` +
        `${exceeds ? "is above" : "is not above"} it.`,
    );
  }

  figures.push(
    figure("Ruin threshold", formatMoney(ruin.threshold), ruin.threshold),
  );
  figures.push(
    figure(
      `Risk of ruin over ${ruin.trades} trades`,
      formatPercent(ruin.probability * 100),
      ruin.probability * 100,
    ),
  );
  summaryParts.push(
    `Across ${ruin.paths.toLocaleString("en-US")} simulated paths of ` +
      `${ruin.trades} trades, ${formatPercent(ruin.probability * 100)} touched ` +
      `${formatMoney(ruin.threshold)} or below at some point.`,
  );

  notes.push(
    `Ruin is defined here as equity touching ${formatMoney(ruin.threshold)}, ` +
      `which is a drawdown of the full risk budget entered ` +
      `(${formatPercent(inputs.riskBudgetFraction * 100)} of starting equity).`,
  );
  notes.push(
    "These numbers are hypothetical and are not stored anywhere after this " +
      "report is rendered.",
  );

  return {
    number: 4,
    title: "Position sizing and risk of ruin",
    summary: summaryParts.join(" "),
    figures,
    notes,
    citation: CITATIONS[4],
  };
}
