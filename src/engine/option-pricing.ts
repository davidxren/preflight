import type { OptionExpirySnapshot, OptionQuote } from "@/market/types";
import { isUsableNumber } from "./formatting";

/**
 * Quote arithmetic shared by checks 1 and 2. Both refuse to compute from a
 * one-sided or crossed market rather than filling in the missing side.
 */

export interface QuoteMath {
  bid: number;
  ask: number;
  mid: number;
}

/**
 * A two-sided, non-crossed quote with a positive mid. A zero or negative mid
 * makes both the implied move and the spread percentage undefined, so it is
 * rejected here rather than producing an infinity downstream.
 */
export function quoteMath(quote: OptionQuote): QuoteMath | null {
  const { bid, ask } = quote;
  if (!isUsableNumber(bid) || !isUsableNumber(ask)) return null;
  if (ask < bid) return null;
  const mid = (bid + ask) / 2;
  if (mid <= 0) return null;
  return { bid, ask, mid };
}

/** (ask − bid) ÷ mid, in percentage points (CLAUDE.md check 2). */
export function spreadPercent(quote: OptionQuote): number | null {
  const math = quoteMath(quote);
  if (!math) return null;
  return ((math.ask - math.bid) / math.mid) * 100;
}

/**
 * Straddle mid ÷ spot, in percentage points (CLAUDE.md check 1). Both legs must
 * be two-sided; a straddle priced off one leg is not a straddle.
 */
export function impliedMovePercent(
  expiry: OptionExpirySnapshot,
  spot: number,
): number | null {
  if (!isUsableNumber(spot) || spot <= 0) return null;
  const call = quoteMath(expiry.call);
  const put = quoteMath(expiry.put);
  if (!call || !put) return null;
  return ((call.mid + put.mid) / spot) * 100;
}

/** The first expiry whose call and put are both two-sided. */
export function firstUsableExpiry(
  expiries: readonly OptionExpirySnapshot[],
): OptionExpirySnapshot | null {
  for (const expiry of expiries) {
    if (quoteMath(expiry.call) && quoteMath(expiry.put)) return expiry;
  }
  return null;
}
