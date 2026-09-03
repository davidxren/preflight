import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTEMPT_TIMEOUT_MS,
  TimeoutError,
  withOneRetry,
  withTimeout,
} from "@/market/fetched";
import { checkEarningsProximity } from "@/engine/check-earnings-proximity";
import { DATA_UNAVAILABLE } from "@/engine/disclaimer";
import { emptySnapshot } from "./support/snapshots";

/**
 * The retry and timeout rules (CLAUDE.md §9; v1.1 hard rule 12 and D1). These
 * bound what a caller waits for and prove that exhausting the bound produces
 * `Data unavailable` with a reason rather than a hang or a thrown stack.
 */

const chart = vi.fn();
const quote = vi.fn();
const options = vi.fn();
const quoteSummary = vi.fn();
const screener = vi.fn();

vi.mock("yahoo-finance2", () => ({
  default: class {
    chart = chart;
    quote = quote;
    options = options;
    quoteSummary = quoteSummary;
    screener = screener;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withOneRetry", () => {
  it("retries exactly once and returns the second attempt's value", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("crumb expired"))
      .mockResolvedValueOnce("second");
    const onRetry = vi.fn();

    await expect(withOneRetry(attempt, onRetry)).resolves.toBe("second");
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not retry an attempt that succeeds", async () => {
    const attempt = vi.fn().mockResolvedValue("first");
    const onRetry = vi.fn();

    await expect(withOneRetry(attempt, onRetry)).resolves.toBe("first");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("surfaces the second failure's reason, not the first, and stops there", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockRejectedValueOnce(new Error("second failure"));

    await expect(withOneRetry(attempt, () => {})).rejects.toThrow("second failure");
    // Exactly two attempts: one retry, never a loop.
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});

describe("withTimeout", () => {
  it("rejects once the wait is exceeded", async () => {
    vi.useFakeTimers();
    const pending = withTimeout("chart(AAPL)", () => new Promise(() => {}), 10_000);
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("names the call and the bound in the reason", async () => {
    vi.useFakeTimers();
    const message = withTimeout(
      "chart(AAPL)",
      () => new Promise(() => {}),
      10_000,
    ).catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(message).resolves.toBe("chart(AAPL) exceeded its 10000 ms timeout");
  });

  it("does not fire for a call that finishes inside the bound", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(
      "chart(AAPL)",
      () => new Promise((resolve) => setTimeout(() => resolve("in time"), 9_999)),
      10_000,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBe("in time");
  });

  it("passes a fast value straight through", async () => {
    await expect(withTimeout("fast", async () => 42)).resolves.toBe(42);
  });

  it("defaults to the owner's 10 s per-attempt bound", () => {
    expect(ATTEMPT_TIMEOUT_MS).toBe(10_000);
  });
});

describe("a hung upstream call", () => {
  it("is bounded, retried once, and reported as a reason rather than a hang", async () => {
    vi.useFakeTimers();
    const { fetchDailyBars } = await import("@/market/yahoo-source");
    chart.mockImplementation(() => new Promise(() => {}));

    const pending = fetchDailyBars("AAPL", "2016-01-01");
    // Two bounded attempts: the retry doubles the bound and no more.
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS * 2 + 10);
    const result = await pending;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Yahoo chart unavailable");
      expect(result.reason).toContain("exceeded its 10000 ms timeout");
    }
    expect(chart).toHaveBeenCalledTimes(2);
  });

  it("renders Data unavailable with that reason on the report", () => {
    const reason =
      "Yahoo earnings calendar unavailable: quoteSummary(AAPL) exceeded its 10000 ms timeout";
    const check = checkEarningsProximity(
      emptySnapshot({
        symbol: "AAPL",
        instrumentType: "EQUITY",
        unavailable: { nextEarningsDate: reason },
      }),
      "2026-09-03",
    );

    const earnings = check.figures.find((f) => f.label === "Next earnings date");
    expect(earnings?.value).toBe(DATA_UNAVAILABLE);
    expect(earnings?.reason).toBe(reason);
  });
});
