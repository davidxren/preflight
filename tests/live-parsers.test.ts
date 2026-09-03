import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  atmPair,
  parseChainSnapshot,
  parseChartBars,
  parseDayGainers,
  parseNextEarningsDate,
  parseSpotQuote,
  parseUpcomingExpiries,
  type RawChart,
  type RawOptionsResponse,
  type RawQuote,
  type RawQuoteSummary,
  type RawScreener,
} from "@/market/yahoo-parsers";

/**
 * Parser coverage against responses actually returned by the upstream source
 * and captured by `scripts/capture-live-fixtures.ts` (v1.1 D1). These are the
 * real shapes, so a change in the feed that the parsers cannot read fails here
 * rather than in production.
 *
 * `quote-summary-spy` is deliberately absent: the ETF has no fundamentals
 * module upstream, so there was nothing to capture and nothing is invented.
 */

const LIVE_DIR = join(new URL("..", import.meta.url).pathname, "tests/fixtures/live");

function live<T>(name: string): T {
  const file = join(LIVE_DIR, `${name}.json`);
  if (!existsSync(file)) {
    throw new Error(
      `Missing captured fixture ${name}. Run: npx tsx scripts/capture-live-fixtures.ts`,
    );
  }
  const document = JSON.parse(readFileSync(file, "utf8")) as {
    capture: { call: string; capturedAt: string };
    response: T;
  };
  return document.response;
}

describe("captured live fixtures", () => {
  it("carry the call that produced them and no key-shaped value", () => {
    for (const name of [
      "chart-aapl",
      "quote-aapl",
      "options-aapl-expiries",
      "options-aapl-chain",
      "quote-summary-aapl",
      "screener-day-gainers",
    ]) {
      const raw = readFileSync(join(LIVE_DIR, `${name}.json`), "utf8");
      const document = JSON.parse(raw) as { capture: { call: string } };
      expect(document.capture.call.length).toBeGreaterThan(0);
      // Hard rule 10: no secret reaches the repo, even in a captured response.
      expect(raw).not.toMatch(/"(crumb|cookie|token|secret|apikey|api_key)"\s*:\s*"(?!\[scrubbed\])/i);
    }
  });
});

describe("parseChartBars", () => {
  const chart = live<RawChart>("chart-aapl");

  it("reads every complete bar out of a real chart response", () => {
    const bars = parseChartBars(chart);
    expect(bars.length).toBeGreaterThan(200);
    expect(bars.length).toBeLessThanOrEqual((chart.quotes ?? []).length);
  });

  it("returns ISO dates in ascending order", () => {
    const bars = parseChartBars(chart);
    for (const bar of bars) expect(bar.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = bars.map((b) => b.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("gives every bar four finite prices and a volume", () => {
    for (const bar of parseChartBars(chart)) {
      for (const value of [bar.open, bar.high, bar.low, bar.close, bar.volume]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(bar.high).toBeGreaterThanOrEqual(bar.low);
    }
  });

  it("rounds feed noise to four decimal places", () => {
    for (const bar of parseChartBars(chart)) {
      expect(bar.close).toBe(Math.round(bar.close * 10_000) / 10_000);
    }
  });

  it("drops a halted session rather than patching it", () => {
    const first = (chart.quotes ?? [])[0];
    const withHalt: RawChart = {
      quotes: [{ ...first, close: null }, ...(chart.quotes ?? []).slice(1)],
    };
    expect(parseChartBars(withHalt).length).toBe(parseChartBars(chart).length - 1);
  });

  it("returns nothing rather than throwing on an empty response", () => {
    expect(parseChartBars({})).toEqual([]);
    expect(parseChartBars({ quotes: [] })).toEqual([]);
  });
});

describe("parseSpotQuote", () => {
  it("reads the price and instrument type off a real equity quote", () => {
    const parsed = parseSpotQuote(live<RawQuote>("quote-aapl"));
    expect(parsed).not.toBeNull();
    expect(Number.isFinite(parsed!.price)).toBe(true);
    expect(parsed!.price).toBeGreaterThan(0);
    expect(parsed!.instrumentType).toBe("EQUITY");
  });

  it("reports nothing rather than a placeholder when the price is missing", () => {
    expect(parseSpotQuote({})).toBeNull();
    expect(parseSpotQuote({ regularMarketPrice: null })).toBeNull();
    expect(parseSpotQuote(undefined)).toBeNull();
  });
});

describe("parseUpcomingExpiries", () => {
  const response = live<RawOptionsResponse>("options-aapl-expiries");

  it("keeps only expiries strictly after the as-of date", () => {
    const all = (response.expirationDates ?? []).map((d) =>
      new Date(d).toISOString().slice(0, 10),
    );
    const asOf = all[0];
    // An expiry on `asOf` settles that day and would understate the move.
    expect(parseUpcomingExpiries(response, asOf, 5)).not.toContain(asOf);
  });

  it("returns at most the requested count, in order", () => {
    const two = parseUpcomingExpiries(response, "2000-01-01", 2);
    expect(two.length).toBe(2);
    expect([...two].sort()).toEqual(two);
  });

  it("returns nothing when every expiry is in the past", () => {
    expect(parseUpcomingExpiries(response, "2999-01-01", 2)).toEqual([]);
  });
});

describe("parseChainSnapshot", () => {
  const chain = live<RawOptionsResponse>("options-aapl-chain");

  it("picks the strike nearest spot that is quoted on both sides", () => {
    const leg = chain.options![0];
    const spot = leg.calls![Math.floor(leg.calls!.length / 2)].strike;
    const snapshot = parseChainSnapshot(chain, "2026-09-04", spot);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.call.strike).toBe(snapshot!.put.strike);
    expect(snapshot!.atmStrike).toBe(snapshot!.call.strike);

    const putStrikes = new Set(leg.puts!.map((p) => p.strike));
    const bestGap = Math.min(
      ...leg.calls!.filter((c) => putStrikes.has(c.strike)).map((c) => Math.abs(c.strike - spot)),
    );
    expect(Math.abs(snapshot!.atmStrike - spot)).toBe(bestGap);
  });

  it("carries the quote through without substituting for a missing side", () => {
    const snapshot = parseChainSnapshot(chain, "2026-09-04", 200)!;
    for (const side of [snapshot.call, snapshot.put]) {
      expect(side.bid === null || Number.isFinite(side.bid)).toBe(true);
      expect(side.ask === null || Number.isFinite(side.ask)).toBe(true);
    }
  });

  it("returns nothing when no strike is quoted on both sides", () => {
    expect(parseChainSnapshot({ options: [{ calls: [], puts: [] }] }, "x", 1)).toBeNull();
    expect(parseChainSnapshot({}, "x", 1)).toBeNull();
  });

  it("matches only on an exact shared strike", () => {
    const pair = atmPair([{ strike: 100 }], [{ strike: 101 }], 100);
    expect(pair).toBeNull();
  });
});

describe("parseNextEarningsDate", () => {
  const summary = live<RawQuoteSummary>("quote-summary-aapl");

  it("reads the next scheduled date off a real equity summary", () => {
    const parsed = parseNextEarningsDate(summary, "2000-01-01");
    expect(parsed).not.toBeNull();
    expect(parsed!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof parsed!.isEstimate).toBe("boolean");
  });

  it("ignores dates before the as-of date", () => {
    expect(parseNextEarningsDate(summary, "2999-01-01")).toBeNull();
  });

  it("reports nothing rather than inventing a date when the module is absent", () => {
    // The shape the ETF path produces upstream, which is why SPY has no fixture.
    expect(parseNextEarningsDate({}, "2026-01-01")).toBeNull();
    expect(parseNextEarningsDate({ calendarEvents: {} }, "2026-01-01")).toBeNull();
  });
});

describe("parseDayGainers", () => {
  it("reads the symbols off a real screen", () => {
    const symbols = parseDayGainers(live<RawScreener>("screener-day-gainers"));
    expect(symbols.length).toBeGreaterThan(0);
    for (const symbol of symbols) expect(typeof symbol).toBe("string");
  });

  it("drops a row with no symbol rather than emitting a blank", () => {
    expect(parseDayGainers({ quotes: [{ symbol: "A" }, {}, { symbol: 7 }] })).toEqual(["A"]);
    expect(parseDayGainers({})).toEqual([]);
  });
});
