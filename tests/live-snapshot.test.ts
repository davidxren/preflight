import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyBar } from "@/market/types";

/**
 * The live fallback wiring (CLAUDE.md §9; v1.1 D1). The upstream responses
 * themselves are covered by the captured fixtures in `live-parsers.test.ts`;
 * what is covered here is which source is consulted when, what note the report
 * carries as a result, and that a field with no working source ends up with a
 * reason rather than a number.
 *
 * The three key-gated fallbacks could not be exercised against their real
 * services in this session — no key was supplied — so they are driven through
 * their module boundary here and remain uncaptured upstream.
 */

const fetchDailyBars = vi.fn();
const fetchSpot = vi.fn();
const fetchOptionExpiries = vi.fn();
const fetchNextEarningsDate = vi.fn();
const fetchDayGainers = vi.fn();
const fetchTiingoBars = vi.fn();
const fetchTradierExpiries = vi.fn();
const fetchFinnhubEarningsDate = vi.fn();

vi.mock("@/market/yahoo-source", () => ({
  fetchDailyBars,
  fetchSpot,
  fetchOptionExpiries,
  fetchNextEarningsDate,
  fetchDayGainers,
}));
vi.mock("@/market/tiingo-source", () => ({ fetchTiingoBars }));
vi.mock("@/market/tradier-source", () => ({
  fetchTradierExpiries,
  TRADIER_DELAY_NOTE: "Option quotes came from the Tradier sandbox.",
}));
vi.mock("@/market/finnhub-source", () => ({ fetchFinnhubEarningsDate }));
// The cache is exercised in data-layer.test.ts; here it must not open a file.
vi.mock("@/db/response-cache", () => ({
  cacheKey: (source: string, symbol: string, part: string) =>
    `${source}:${symbol}:${part}`,
  readCache: () => null,
  writeCache: () => {},
}));

const BARS: DailyBar[] = [
  { date: "2026-08-27", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  { date: "2026-08-28", open: 1.5, high: 2.5, low: 1, close: 2, volume: 20 },
];

const ok = <T,>(value: T) => ({ ok: true as const, value });
const failed = (reason: string) => ({ ok: false as const, reason });

beforeEach(() => {
  vi.clearAllMocks();
  fetchDailyBars.mockResolvedValue(ok(BARS));
  fetchSpot.mockResolvedValue(ok({ price: 2, instrumentType: "EQUITY" }));
  fetchOptionExpiries.mockResolvedValue(ok([]));
  fetchNextEarningsDate.mockResolvedValue(ok({ date: "2026-10-29", isEstimate: false }));
  fetchDayGainers.mockResolvedValue(ok(["AAA"]));
  fetchTiingoBars.mockResolvedValue(failed("TIINGO_API_KEY is not set."));
  fetchTradierExpiries.mockResolvedValue(failed("TRADIER_SANDBOX_TOKEN is not set."));
  fetchFinnhubEarningsDate.mockResolvedValue(failed("FINNHUB_API_KEY is not set."));
});

async function snapshot(symbol = "AAPL") {
  const { liveSnapshot } = await import("@/market/live-snapshot");
  return liveSnapshot(symbol);
}

describe("price history", () => {
  it("does not consult the fallback while the primary answers", async () => {
    const result = await snapshot();
    expect(result.ok).toBe(true);
    expect(fetchTiingoBars).not.toHaveBeenCalled();
  });

  it("falls back to Tiingo and says so on the report", async () => {
    fetchDailyBars.mockResolvedValue(failed("Yahoo chart unavailable: HTTP 429"));
    fetchTiingoBars.mockResolvedValue(ok(BARS));

    const result = await snapshot();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.bars).toEqual(BARS);
      expect(result.value.provenance).toContain("Tiingo fallback");
    }
  });

  it("fails with both reasons when neither source has history", async () => {
    fetchDailyBars.mockResolvedValue(failed("Yahoo chart unavailable: HTTP 429"));
    fetchTiingoBars.mockResolvedValue(failed("TIINGO_API_KEY is not set."));

    const result = await snapshot();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("HTTP 429");
      expect(result.reason).toContain("TIINGO_API_KEY is not set.");
    }
  });
});

describe("spot price", () => {
  it("stands the last observed close in for a failed quote and says so", async () => {
    fetchSpot.mockResolvedValue(failed("Yahoo quote unavailable"));

    const result = await snapshot();
    expect(result.ok).toBe(true);
    if (result.ok) {
      // A real observed close, never an estimate (CLAUDE.md §2.1).
      expect(result.value.spot).toBe(BARS[BARS.length - 1].close);
      expect(result.value.provenance).toContain("the live quote failed");
    }
  });
});

describe("fields with no working source", () => {
  it("records a reason for each rather than a number", async () => {
    fetchOptionExpiries.mockResolvedValue(failed("Yahoo options unavailable"));
    fetchNextEarningsDate.mockResolvedValue(failed("Yahoo earnings unavailable"));
    fetchDayGainers.mockResolvedValue(failed("Yahoo day-gainers screen unavailable"));

    const result = await snapshot();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { unavailable, expiries, nextEarningsDate, dayGainers } = result.value;
      expect(expiries).toEqual([]);
      expect(nextEarningsDate).toBeNull();
      expect(dayGainers).toBeNull();
      expect(unavailable.expiries).toContain("TRADIER_SANDBOX_TOKEN is not set.");
      expect(unavailable.nextEarningsDate).toContain("FINNHUB_API_KEY is not set.");
      // The screen has no documented fallback, so its reason stands alone.
      expect(unavailable.dayGainers).toBe("Yahoo day-gainers screen unavailable");
    }
  });

  it("uses the Tradier and Finnhub fallbacks when they answer", async () => {
    fetchOptionExpiries.mockResolvedValue(failed("Yahoo options unavailable"));
    fetchNextEarningsDate.mockResolvedValue(failed("Yahoo earnings unavailable"));
    fetchTradierExpiries.mockResolvedValue(
      ok([
        {
          expiry: "2026-09-04",
          atmStrike: 2,
          call: { strike: 2, bid: 1, ask: 1.1, lastPrice: 1.05 },
          put: { strike: 2, bid: 1, ask: 1.1, lastPrice: 1.05 },
        },
      ]),
    );
    fetchFinnhubEarningsDate.mockResolvedValue(ok("2026-11-01"));

    const result = await snapshot();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.expiries).toHaveLength(1);
      expect(result.value.nextEarningsDate).toBe("2026-11-01");
      expect(result.value.provenance).toContain("Tradier sandbox");
      expect(result.value.provenance).toContain("Finnhub fallback");
      expect(result.value.unavailable.expiries).toBeUndefined();
      expect(result.value.unavailable.nextEarningsDate).toBeUndefined();
    }
  });
});
