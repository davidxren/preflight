import { toIsoDate, toUtcIsoDate } from "@/engine/calendar";
import type { DailyBar, OptionExpirySnapshot, OptionQuote } from "./types";

/**
 * Pure parsing of yahoo-finance2 responses, split out of the fetchers so the
 * captured live responses under `tests/fixtures/live/` can exercise exactly
 * the code that runs in production without a network call (v1.1 D1).
 *
 * Every function here is total: it returns null or an empty result rather than
 * throwing, and never substitutes a number for a missing one (CLAUDE.md §2.1).
 */

/** Feed values carry float32 noise (188.44000244…); 4dp is the real precision. */
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface RawChartQuote {
  date: string | number | Date;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
}

export interface RawChart {
  quotes?: RawChartQuote[];
}

/**
 * Yahoo emits null OHLC for halted sessions. A partial bar cannot be repaired
 * without inventing numbers, so it is dropped entirely rather than patched.
 */
export function parseChartBars(chart: RawChart): DailyBar[] {
  const bars: DailyBar[] = [];
  for (const q of chart.quotes ?? []) {
    const open = finite(q.open);
    const high = finite(q.high);
    const low = finite(q.low);
    const close = finite(q.close);
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
  return bars;
}

export interface SpotQuote {
  price: number;
  /** "EQUITY", "ETF", "INDEX", …; drives whether earnings are even expected. */
  instrumentType: string | null;
}

export interface RawQuote {
  regularMarketPrice?: number | null;
  quoteType?: string | null;
}

export function parseSpotQuote(quote: RawQuote | null | undefined): SpotQuote | null {
  const price = finite(quote?.regularMarketPrice);
  if (price === null) return null;
  return { price: round4(price), instrumentType: quote?.quoteType ?? null };
}

export interface RawContract {
  strike: number;
  bid?: number | null;
  ask?: number | null;
  lastPrice?: number | null;
}

export interface RawOptionsResponse {
  expirationDates?: (string | number | Date)[];
  options?: { calls?: RawContract[]; puts?: RawContract[] }[];
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
export function atmPair(
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
export function parseUpcomingExpiries(
  response: RawOptionsResponse,
  asOf: string,
  count: number,
): string[] {
  return (response.expirationDates ?? [])
    .map((d) => toUtcIsoDate(new Date(d)))
    .filter((d) => d > asOf)
    .slice(0, count);
}

/** One expiry's at-the-money straddle, or null when no strike is quoted both ways. */
export function parseChainSnapshot(
  response: RawOptionsResponse,
  expiry: string,
  spot: number,
): OptionExpirySnapshot | null {
  const leg = response.options?.[0];
  if (!leg) return null;
  const pair = atmPair(leg.calls ?? [], leg.puts ?? [], spot);
  if (!pair) return null;
  return {
    expiry,
    atmStrike: pair.call.strike,
    call: toQuote(pair.call),
    put: toQuote(pair.put),
  };
}

export interface EarningsDate {
  date: string;
  isEstimate: boolean;
}

export interface RawQuoteSummary {
  calendarEvents?: {
    earnings?: {
      earningsDate?: (string | number | Date)[];
      isEarningsDateEstimate?: boolean;
    };
  };
}

export function parseNextEarningsDate(
  summary: RawQuoteSummary,
  asOf: string,
): EarningsDate | null {
  const earnings = summary.calendarEvents?.earnings;
  const upcoming = (earnings?.earningsDate ?? [])
    .map((d) => toIsoDate(new Date(d)))
    .filter((d) => d >= asOf)
    .sort();
  if (upcoming.length === 0) return null;
  return {
    date: upcoming[0],
    isEstimate: earnings?.isEarningsDateEstimate === true,
  };
}

export interface RawScreener {
  quotes?: { symbol?: unknown }[];
}

export function parseDayGainers(screen: RawScreener): string[] {
  return (screen.quotes ?? [])
    .map((q) => q.symbol)
    .filter((s): s is string => typeof s === "string");
}
