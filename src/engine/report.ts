import type { MarketSnapshot } from "@/market/types";
import { checkEarningsProximity } from "./check-earnings-proximity";
import { checkMacroProximity } from "./check-macro-proximity";
import { checkPatternBaseRates } from "./check-pattern-base-rates";
import { checkRiskOfRuin } from "./check-risk-of-ruin";
import { checkSpreadDrag } from "./check-spread-drag";
import { checkTopMover } from "./check-top-mover";
import { LEGAL_DISCLAIMER } from "./disclaimer";
import { templateExplanation } from "./explainer-template";
import type { Report, SizingInputs, TradeAction } from "./types";

/**
 * Assembles the six checks into a report. Pure: every input arrives as an
 * argument, including the date, so a report is reproducible and testable.
 */
export interface ReportInput {
  snapshot: MarketSnapshot;
  action: TradeAction;
  /** Calendar date the report is built for, `YYYY-MM-DD`. */
  today: string;
  /** Hypothetical sizing numbers; null when none were entered. */
  sizing?: SizingInputs | null;
}

export function buildReport({
  snapshot,
  action,
  today,
  sizing = null,
}: ReportInput): Report {
  const checks = [
    checkEarningsProximity(snapshot, today),
    checkSpreadDrag(snapshot, action),
    checkTopMover(snapshot),
    checkRiskOfRuin(sizing),
    checkPatternBaseRates(snapshot),
    checkMacroProximity(today),
  ];

  return {
    symbol: snapshot.symbol,
    action,
    today,
    asOf: snapshot.asOf,
    source: snapshot.source,
    provenance: snapshot.provenance,
    checks,
    disclaimer: LEGAL_DISCLAIMER,
    explanation: {
      text: templateExplanation(snapshot.symbol, action, checks),
      origin: "template",
    },
  };
}
