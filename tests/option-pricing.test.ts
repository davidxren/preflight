import { describe, expect, it } from "vitest";
import {
  firstUsableExpiry,
  impliedMovePercent,
  quoteMath,
  spreadPercent,
} from "@/engine/option-pricing";
import type { OptionExpirySnapshot, OptionQuote } from "@/market/types";

function quote(bid: number | null, ask: number | null): OptionQuote {
  return { strike: 100, bid, ask, lastPrice: null };
}

function expiry(
  call: OptionQuote,
  put: OptionQuote,
  date: string = "2026-08-31",
): OptionExpirySnapshot {
  return { expiry: date, atmStrike: 100, call, put };
}

describe("quoteMath", () => {
  it("computes the mid of a two-sided quote", () => {
    expect(quoteMath(quote(1, 2))?.mid).toBe(1.5);
  });

  it("rejects a one-sided quote rather than assuming the other side", () => {
    expect(quoteMath(quote(1, null))).toBeNull();
    expect(quoteMath(quote(null, 2))).toBeNull();
  });

  it("rejects a crossed market", () => {
    expect(quoteMath(quote(3, 2))).toBeNull();
  });

  it("rejects a zero mid, which would divide by zero downstream", () => {
    expect(quoteMath(quote(0, 0))).toBeNull();
  });
});

describe("spreadPercent", () => {
  it("computes (ask − bid) ÷ mid in percentage points", () => {
    // bid 1, ask 2, mid 1.5 -> 1 / 1.5 = 66.67%.
    expect(spreadPercent(quote(1, 2))).toBeCloseTo(66.6667, 3);
  });

  it("is zero for a locked market", () => {
    expect(spreadPercent(quote(2, 2))).toBe(0);
  });

  it("returns null when the quote is unusable", () => {
    expect(spreadPercent(quote(null, 2))).toBeNull();
  });
});

describe("impliedMovePercent", () => {
  it("computes straddle mid ÷ spot in percentage points", () => {
    // call mid 2, put mid 3, spot 100 -> 5%.
    expect(impliedMovePercent(expiry(quote(1.5, 2.5), quote(2.5, 3.5)), 100)).toBeCloseTo(5, 12);
  });

  it("refuses to price a straddle off one usable leg", () => {
    expect(impliedMovePercent(expiry(quote(1.5, 2.5), quote(null, 3.5)), 100)).toBeNull();
  });

  it("returns null for a spot price that is not positive", () => {
    expect(impliedMovePercent(expiry(quote(1, 2), quote(1, 2)), 0)).toBeNull();
  });
});

describe("firstUsableExpiry", () => {
  it("skips an expiry with a one-sided leg", () => {
    const bad = expiry(quote(1, 2), quote(null, 2), "2026-08-31");
    const good = expiry(quote(1, 2), quote(1, 2), "2026-09-02");
    expect(firstUsableExpiry([bad, good])?.expiry).toBe("2026-09-02");
  });

  it("returns null when no expiry is usable", () => {
    expect(firstUsableExpiry([])).toBeNull();
    expect(firstUsableExpiry([expiry(quote(null, null), quote(null, null))])).toBeNull();
  });
});
