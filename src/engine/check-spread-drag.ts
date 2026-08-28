import type { OptionExpirySnapshot, OptionQuote } from "@/market/types";
import type { MarketSnapshot } from "@/market/types";
import { CITATIONS } from "./citations";
import { figure, formatPercent, unavailable } from "./formatting";
import { firstUsableExpiry, quoteMath, spreadPercent } from "./option-pricing";
import type { CheckResult, TradeAction } from "./types";

/**
 * Check 2 — round-trip cost baked into the at-the-money quote,
 * (ask − bid) ÷ mid. The contract that matters follows the intended action.
 */

/** Stated on the report so the reader knows this is not an option spread. */
const SHARES_NOT_APPLICABLE =
  "Not applicable — buying shares does not involve an option contract";

function legFor(
  action: TradeAction,
  expiry: OptionExpirySnapshot,
): { label: string; quote: OptionQuote } | null {
  if (action === "buy call") {
    return { label: `${expiry.expiry} ${expiry.atmStrike} call`, quote: expiry.call };
  }
  if (action === "buy put") {
    return { label: `${expiry.expiry} ${expiry.atmStrike} put`, quote: expiry.put };
  }
  return null;
}

function quoteFigures(label: string, quote: OptionQuote) {
  const math = quoteMath(quote);
  if (!math) return [];
  return [
    figure(`${label} bid`, math.bid.toFixed(2), math.bid),
    figure(`${label} ask`, math.ask.toFixed(2), math.ask),
  ];
}

export function checkSpreadDrag(
  snapshot: MarketSnapshot,
  action: TradeAction,
): CheckResult {
  const expiry = firstUsableExpiry(snapshot.expiries);
  const figures = [];
  const notes: string[] = [];
  let summary: string;

  if (!expiry) {
    const reason =
      snapshot.unavailable.expiries ??
      "No expiry carried a two-sided at-the-money call and put.";
    figures.push(unavailable("At-the-money spread", reason));
    summary = "The at-the-money bid-ask spread could not be computed.";
  } else if (action === "buy shares") {
    // The check still reports the option market, clearly labelled as reference,
    // so the figure is never mistaken for the cost of buying shares.
    figures.push(figure("At-the-money spread", SHARES_NOT_APPLICABLE));
    const callSpread = spreadPercent(expiry.call);
    const putSpread = spreadPercent(expiry.put);
    if (callSpread !== null) {
      figures.push(
        figure(
          `Reference: ${expiry.expiry} ${expiry.atmStrike} call spread`,
          formatPercent(callSpread),
          callSpread,
        ),
      );
    }
    if (putSpread !== null) {
      figures.push(
        figure(
          `Reference: ${expiry.expiry} ${expiry.atmStrike} put spread`,
          formatPercent(putSpread),
          putSpread,
        ),
      );
    }
    notes.push(
      "These reference figures describe the option market on this ticker. " +
        "They are not the spread on the shares themselves.",
    );
    summary =
      "Buying shares does not cross an option spread. The at-the-money option " +
      "quotes are shown for reference only.";
  } else {
    const leg = legFor(action, expiry);
    const spread = leg ? spreadPercent(leg.quote) : null;
    if (!leg || spread === null) {
      const reason = "The at-the-money contract for this action was not two-sided.";
      figures.push(unavailable("At-the-money spread", reason));
      summary = "The at-the-money bid-ask spread could not be computed.";
    } else {
      figures.push(figure("Contract", leg.label));
      figures.push(...quoteFigures(leg.label, leg.quote));
      figures.push(
        figure("Spread as % of mid", formatPercent(spread), spread),
      );
      notes.push(
        "Spread is (ask − bid) ÷ mid for the at-the-money contract at the " +
          "nearest usable expiry. Crossing it once costs half the spread; a " +
          "round trip costs the whole spread.",
      );
      summary =
        `The ${leg.label} quote carries a ${formatPercent(spread)} bid-ask ` +
        "spread relative to its mid.";
    }
  }

  return {
    number: 2,
    title: "Options bid-ask spread drag",
    summary,
    figures,
    notes,
    citation: CITATIONS[2],
  };
}
