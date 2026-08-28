import { addIsoDays } from "@/engine/calendar";
import { failed, ok, reasonFrom, type Fetched } from "./fetched";

/**
 * Earnings-date fallback (CLAUDE.md §9), used only when the primary source
 * fails and FINNHUB_API_KEY is set.
 */

const BASE = "https://finnhub.io/api/v1/calendar/earnings";
const TIMEOUT_MS = 15_000;
/** How far ahead to look for the next scheduled announcement. */
const HORIZON_DAYS = 400;

interface FinnhubEarnings {
  earningsCalendar?: { symbol?: string; date?: string }[];
}

export async function fetchFinnhubEarningsDate(
  symbol: string,
  asOf: string,
): Promise<Fetched<string>> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) {
    return failed("Earnings fallback needs FINNHUB_API_KEY, which is not set.");
  }
  try {
    const url = `${BASE}?${new URLSearchParams({
      symbol,
      from: asOf,
      to: addIsoDays(asOf, HORIZON_DAYS),
      token: key,
    })}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return failed(`Finnhub returned HTTP ${response.status}.`);
    const body = (await response.json()) as FinnhubEarnings;
    const dates = (body.earningsCalendar ?? [])
      .filter((e) => e.symbol?.toUpperCase() === symbol.toUpperCase())
      .map((e) => e.date)
      .filter((d): d is string => typeof d === "string" && d >= asOf)
      .sort();
    if (dates.length === 0) {
      return failed("Finnhub listed no upcoming earnings date.");
    }
    return ok(dates[0]);
  } catch (error) {
    return failed(reasonFrom(error, "Finnhub unavailable"));
  }
}
