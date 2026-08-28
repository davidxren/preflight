import type { MarketSnapshot } from "@/market/types";
import { isoDaysBetween } from "./calendar";
import { CITATIONS } from "./citations";
import { figure, formatCount, formatPercent, pluralize, unavailable } from "./formatting";
import { firstUsableExpiry, impliedMovePercent } from "./option-pricing";
import { tradingDaysUntil } from "./trading-calendar";
import type { CheckResult } from "./types";

/**
 * Check 1 — earnings proximity and the implied move priced into the nearest
 * expiry. Both figures are reported independently: a missing earnings date
 * does not suppress the implied move, and vice versa.
 */

/** Instrument types that never have a scheduled earnings announcement. */
const NO_EARNINGS_TYPES = new Set(["ETF", "INDEX", "MUTUALFUND", "CURRENCY"]);

export function checkEarningsProximity(
  snapshot: MarketSnapshot,
  today: string,
): CheckResult {
  const figures = [];
  const notes: string[] = [];
  const summaryParts: string[] = [];

  const noEarningsInstrument =
    snapshot.instrumentType !== null &&
    NO_EARNINGS_TYPES.has(snapshot.instrumentType.toUpperCase());

  if (snapshot.nextEarningsDate) {
    const calendarDays = isoDaysBetween(today, snapshot.nextEarningsDate);
    const sessions = tradingDaysUntil(today, snapshot.nextEarningsDate);
    figures.push(figure("Next earnings date", snapshot.nextEarningsDate));
    if (calendarDays >= 0) {
      figures.push(
        figure(
          "Days until next earnings",
          `${formatCount(calendarDays)} ${pluralize(calendarDays, "day", "days")}`,
          calendarDays,
        ),
      );
      summaryParts.push(
        `Next earnings is ${snapshot.nextEarningsDate}, ${formatCount(calendarDays)} ` +
          `${pluralize(calendarDays, "calendar day", "calendar days")} away` +
          (sessions === null ? "" : ` (${formatCount(sessions)} trading ${pluralize(sessions, "session", "sessions")})`) +
          ".",
      );
    } else {
      figures.push(
        unavailable(
          "Days until next earnings",
          `The listed earnings date ${snapshot.nextEarningsDate} is before ${today}.`,
        ),
      );
      summaryParts.push(
        `The listed earnings date ${snapshot.nextEarningsDate} is already past.`,
      );
    }
    if (snapshot.earningsDateIsEstimate) {
      notes.push("The data source flags this earnings date as an estimate.");
    }
  } else if (noEarningsInstrument) {
    // Absence of earnings for an ETF is a fact about the instrument, not a
    // gap in the data, so it is stated rather than marked unavailable.
    figures.push(
      figure(
        "Next earnings date",
        `None scheduled — ${snapshot.symbol} is an ${snapshot.instrumentType}`,
      ),
    );
    summaryParts.push(
      `${snapshot.symbol} is an ${snapshot.instrumentType} and has no scheduled earnings announcement.`,
    );
  } else {
    const reason =
      snapshot.unavailable.nextEarningsDate ??
      "No earnings date was present in the loaded data.";
    figures.push(unavailable("Next earnings date", reason));
    figures.push(unavailable("Days until next earnings", reason));
    summaryParts.push("The next earnings date could not be read.");
  }

  const expiry = firstUsableExpiry(snapshot.expiries);
  const move =
    expiry && snapshot.spot !== null
      ? impliedMovePercent(expiry, snapshot.spot)
      : null;

  if (expiry && move !== null) {
    figures.push(figure("Implied move expiry", expiry.expiry));
    figures.push(
      figure("Implied move (ATM straddle ÷ spot)", formatPercent(move), move),
    );
    notes.push(
      `Implied move is the ${expiry.expiry} at-the-money straddle mid ` +
        `(strike ${expiry.atmStrike}) divided by the spot price.`,
    );
    summaryParts.push(
      `The nearest expiry prices a ${formatPercent(move)} move by ${expiry.expiry}.`,
    );
  } else {
    const reason =
      snapshot.unavailable.expiries ??
      (snapshot.spot === null
        ? snapshot.unavailable.spot ?? "No spot price was present in the loaded data."
        : "No expiry carried a two-sided at-the-money call and put.");
    figures.push(unavailable("Implied move (ATM straddle ÷ spot)", reason));
    summaryParts.push("The implied move could not be computed.");
  }

  return {
    number: 1,
    title: "Earnings proximity and implied move",
    summary: summaryParts.join(" "),
    figures,
    notes,
    citation: CITATIONS[1],
  };
}
