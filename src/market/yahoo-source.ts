import YahooFinance from "yahoo-finance2";
import {
  failed,
  ok,
  reasonFrom,
  withOneRetry,
  withTimeout,
  type Fetched,
} from "./fetched";
import {
  parseChainSnapshot,
  parseChartBars,
  parseDayGainers,
  parseNextEarningsDate,
  parseSpotQuote,
  parseUpcomingExpiries,
  type EarningsDate,
  type SpotQuote,
} from "./yahoo-parsers";
import type { DailyBar, OptionExpirySnapshot } from "./types";

/**
 * Primary keyless source. yahoo-finance2 is unofficial: it depends on a
 * crumb/cookie that can expire within ~10-20 minutes and it rate-limits, so
 * every call is bounded, retries once, and then reports a reason rather than
 * throwing. Parsing lives in `yahoo-parsers.ts` so the captured responses in
 * `tests/fixtures/live/` cover it without a network call.
 */

export type { EarningsDate, SpotQuote };

let client: InstanceType<typeof YahooFinance> | null = null;

function yahoo(): InstanceType<typeof YahooFinance> {
  // The survey notice writes to stdout, which would corrupt `--json` output.
  client ??= new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return client;
}

function warn(context: string, error: unknown): void {
  console.warn(`[preflight] retrying ${context}: ${reasonFrom(error, "cause")}`);
}

/**
 * The library takes no AbortSignal, so each attempt is bounded here (v1.1 hard
 * rule 12) and `withOneRetry` doubles that bound at most.
 */
function bounded<T>(label: string, call: () => Promise<T>): Promise<T> {
  return withOneRetry(
    () => withTimeout(label, call),
    (error) => warn(label, error),
  );
}

export async function fetchDailyBars(
  symbol: string,
  fromIsoDate: string,
): Promise<Fetched<DailyBar[]>> {
  try {
    const chart = await bounded(`chart(${symbol})`, () =>
      yahoo().chart(symbol, { period1: fromIsoDate, interval: "1d" }),
    );
    const bars = parseChartBars(chart);
    if (bars.length === 0) return failed("Yahoo chart returned no usable bars");
    return ok(bars);
  } catch (error) {
    return failed(reasonFrom(error, "Yahoo chart unavailable"));
  }
}

export async function fetchSpot(symbol: string): Promise<Fetched<SpotQuote>> {
  try {
    const quote = await bounded(`quote(${symbol})`, () => yahoo().quote(symbol));
    const parsed = parseSpotQuote(quote);
    if (parsed === null) return failed("Yahoo quote carried no market price");
    return ok(parsed);
  } catch (error) {
    return failed(reasonFrom(error, "Yahoo quote unavailable"));
  }
}

export async function fetchOptionExpiries(
  symbol: string,
  asOf: string,
  spot: number,
  count: number = 2,
): Promise<Fetched<OptionExpirySnapshot[]>> {
  try {
    const first = await bounded(`options(${symbol})`, () => yahoo().options(symbol));
    const upcoming = parseUpcomingExpiries(first, asOf, count);
    if (upcoming.length === 0) {
      return failed(`Yahoo listed no option expiry after ${asOf}`);
    }

    const snapshots: OptionExpirySnapshot[] = [];
    for (const expiry of upcoming) {
      const chain = await bounded(`options(${symbol}, ${expiry})`, () =>
        yahoo().options(symbol, { date: new Date(`${expiry}T00:00:00Z`) }),
      );
      const snapshot = parseChainSnapshot(chain, expiry, spot);
      if (snapshot) snapshots.push(snapshot);
    }
    if (snapshots.length === 0) {
      return failed("Yahoo option chains carried no matched call/put strike");
    }
    return ok(snapshots);
  } catch (error) {
    return failed(reasonFrom(error, "Yahoo options unavailable"));
  }
}

export async function fetchNextEarningsDate(
  symbol: string,
  asOf: string,
): Promise<Fetched<EarningsDate>> {
  try {
    const summary = await bounded(`quoteSummary(${symbol})`, () =>
      yahoo().quoteSummary(symbol, { modules: ["calendarEvents"] }),
    );
    const parsed = parseNextEarningsDate(summary, asOf);
    if (parsed === null) return failed("Yahoo listed no upcoming earnings date");
    return ok(parsed);
  } catch (error) {
    return failed(reasonFrom(error, "Yahoo earnings calendar unavailable"));
  }
}

export async function fetchDayGainers(
  count: number = 25,
): Promise<Fetched<string[]>> {
  try {
    const screen = await bounded("screener(day_gainers)", () =>
      yahoo().screener({ scrIds: "day_gainers", count }),
    );
    const symbols = parseDayGainers(screen);
    if (symbols.length === 0) return failed("Yahoo day-gainers screen was empty");
    return ok(symbols);
  } catch (error) {
    return failed(reasonFrom(error, "Yahoo day-gainers screen unavailable"));
  }
}
