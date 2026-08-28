import { sampleSnapshot } from "@/market/sample-source";
import type { MarketSnapshot } from "@/market/types";

/** The AAPL fixture, or a hard failure — tests must not run on a stub. */
export function fixture(symbol: string): MarketSnapshot {
  const result = sampleSnapshot(symbol);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

/** A snapshot with every optional field stripped, for the unavailable paths. */
export function emptySnapshot(
  overrides: Partial<MarketSnapshot> = {},
): MarketSnapshot {
  return {
    symbol: "ZZZZ",
    source: "sample",
    provenance: "test",
    capturedAt: "2026-08-28T20:00:00.000Z",
    asOf: null,
    spot: null,
    instrumentType: null,
    bars: [],
    expiries: [],
    nextEarningsDate: null,
    earningsDateIsEstimate: false,
    dayGainers: null,
    unavailable: {},
    ...overrides,
  };
}
