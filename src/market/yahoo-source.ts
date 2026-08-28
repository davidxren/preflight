import YahooFinance from "yahoo-finance2";
import { toIsoDate, toUtcIsoDate } from "@/engine/calendar";
import { failed, ok, reasonFrom, withOneRetry, type Fetched } from "./fetched";
import type { DailyBar, OptionExpirySnapshot, OptionQuote } from "./types";

/**
 * Primary keyless source. yahoo-finance2 is unofficial: it depends on a
 * crumb/cookie that can expire within ~10-20 minutes and it rate-limits, so
 * every call retries once and then reports a reason rather than throwing.
 */

let client: InstanceType<typeof YahooFinance> | null = null;

function yahoo(): InstanceType<typeof YahooFinance> {
  // The survey notice writes to stdout, which would corrupt `--json` output.
  client ??= new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return client;
}

function warn(context: string, error: unknown): void {
  console.warn(`[preflight] retrying ${context}: ${reasonFrom(error, "cause")}`);
}

/** Feed values carry float32 noise (188.44000244…); 4dp is the real precision. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function fetchDailyBars(
  symbol: string,
  fromIsoDate: string,
): Promise<Fetched<DailyBar[]>> {
  try {
    const chart = await withOneRetry(
      () =>
        yahoo().chart(symbol, {
          period1: fromIsoDate,
          interval: "1d",
        }),
      (error) => warn(`chart(${symbol})`, error),
    );
    const bars: DailyBar[] = [];
    for (const q of chart.quotes) {
      const open = finite(q.open);
      const high = finite(q.high);
      const low = finite(q.low);
      const close = finite(q.close);
      // Yahoo emits null OHLC for halted sessions; a partial bar cannot be
      // repaired without inventing numbers, so it is dropped entirely.
      if (open === null || high === null || low === null || close === null) {
        continue;
      }
      bars.push({
        date: toIsoDate(new Date(q.date)),
        open: round4(open),
        high: round4(high),
        low: round4(low),
        close: round4(close),
        volume: finite(q.volume) ?? 0,
      });
    }
    if (bars.length === 0) return failed("Yahoo chart returned no usable bars");
    return ok(bars);
  } catch (error) {
    return failed(reasonFrom(error, "Yahoo chart unavailable"));
  }
}

export interface SpotQuote {
  price: number;
  /** "EQUITY", "ETF", "INDEX", …; drives whether earnings are even expected. */
  instrumentType: string | null;
}

export async function fetchSpot(symbol: string): Promise<Fetched<SpotQuote>> {
  try {
    const quote = await withOneRetry(
      () => yahoo().quote(symbol),
      (error) => warn(`quote(${symbol})`, error),
    );
    const price = finite(quote?.regularMarketPrice);
    if (price === null) return failed("Yahoo quote carried no market price");
    return ok({
      price: round4(price),
      instrumentType: quote?.quoteType ?? null,
    });
  } catch (error) {
    return failed(reasonFrom(error, "Yahoo quote unavailable"));
  }
}

interface RawContract {
  strike: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
}

function toQuote(contract: RawContract): OptionQuote {
  return {
    strike: contract.strike,
    bid: finite(contract.bid),
    ask: finite(contract.ask),
    lastPrice: finite(contract.lastPrice),
  };
}

/** The strike nearest `spot` that is quoted on both sides of the chain. */
function atmPair(
  calls: RawContract[],
  puts: RawContract[],
  spot: number,
): { call: RawContract; put: RawContract } | null {
  const putsByStrike = new Map(puts.map((p) => [p.strike, p]));
  let best: { call: RawContract; put: RawContract; gap: number } | null = null;
  for (const call of calls) {
    const put = putsByStrike.get(call.strike);
    if (!put) continue;
    const gap = Math.abs(call.strike - spot);
    if (!best || gap < best.gap) best = { call, put, gap };
  }
  return best ? { call: best.call, put: best.put } : null;
}

/**
 * The nearest `count` expiries strictly after `asOf`. An expiry on `asOf`
 * itself settles at that day's close, so its straddle no longer prices a
 * forward move and would understate the implied move.
 */
export async function fetchOptionExpiries(
  symbol: string,
  asOf: string,
  spot: number,
  count: number = 2,
): Promise<Fetched<OptionExpirySnapshot[]>> {
  try {
    const first = await withOneRetry(
      () => yahoo().options(symbol),
      (error) => warn(`options(${symbol})`, error),
    );
    const upcoming = (first.expirationDates ?? [])
      .map((d: Date) => toUtcIsoDate(new Date(d)))
      .filter((d: string) => d > asOf)
      .slice(0, count);
    if (upcoming.length === 0) {
      return failed(`Yahoo listed no option expiry after ${asOf}`);
    }

    const snapshots: OptionExpirySnapshot[] = [];
    for (const expiry of upcoming) {
      const chain = await withOneRetry(
        () => yahoo().options(symbol, { date: new Date(`${expiry}T00:00:00Z`) }),
        (error) => warn(`options(${symbol}, ${expiry})`, error),
      );
      const leg = chain.options?.[0];
      if (!leg) continue;
      const pair = atmPair(
        (leg.calls ?? []) as RawContract[],
        (leg.puts ?? []) as RawContract[],
        spot,
      );
      if (!pair) continue;
      snapshots.push({
        expiry,
        atmStrike: pair.call.strike,
        call: toQuote(pair.call),
        put: toQuote(pair.put),
      });
    }
    if (snapshots.length === 0) {
      return failed("Yahoo option chains carried no matched call/put strike");
    }
    return ok(snapshots);
  } catch (error) {
    return failed(reasonFrom(error, "Yahoo options unavailable"));
  }
}

export interface EarningsDate {
  date: string;
  isEstimate: boolean;
}

export async function fetchNextEarningsDate(
  symbol: string,
  asOf: string,
): Promise<Fetched<EarningsDate>> {
  try {
    const summary = await withOneRetry(
      () => yahoo().quoteSummary(symbol, { modules: ["calendarEvents"] }),
      (error) => warn(`quoteSummary(${symbol})`, error),
    );
    const earnings = summary.calendarEvents?.earnings;
    const upcoming = (earnings?.earningsDate ?? [])
      .map((d) => toIsoDate(new Date(d)))
      .filter((d) => d >= asOf)
      .sort();
    if (upcoming.length === 0) {
      return failed("Yahoo listed no upcoming earnings date");
    }
    return ok({
      date: upcoming[0],
      isEstimate: earnings?.isEarningsDateEstimate === true,
    });
  } catch (error) {
    return failed(reasonFrom(error, "Yahoo earnings calendar unavailable"));
  }
}

export async function fetchDayGainers(
  count: number = 25,
): Promise<Fetched<string[]>> {
  try {
    const screen = await withOneRetry(
      () => yahoo().screener({ scrIds: "day_gainers", count }),
      (error) => warn("screener(day_gainers)", error),
    );
    const symbols = (screen.quotes ?? [])
      .map((q) => q.symbol)
      .filter((s): s is string => typeof s === "string");
    if (symbols.length === 0) return failed("Yahoo day-gainers screen was empty");
    return ok(symbols);
  } catch (error) {
    return failed(reasonFrom(error, "Yahoo day-gainers screen unavailable"));
  }
}
