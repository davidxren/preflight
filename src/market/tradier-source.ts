import { failed, ok, reasonFrom, type Fetched } from "./fetched";
import type { OptionExpirySnapshot, OptionQuote } from "./types";

/**
 * Options-chain fallback (CLAUDE.md §9), used only when the primary source
 * fails and TRADIER_SANDBOX_TOKEN is set. Sandbox quotes are delayed; the
 * report says so wherever they are used.
 */

const BASE = "https://sandbox.tradier.com/v1/markets";
const TIMEOUT_MS = 15_000;

export const TRADIER_DELAY_NOTE =
  "Option quotes came from the Tradier sandbox, which serves delayed data.";

interface TradierOption {
  strike: number;
  option_type: "call" | "put";
  bid: number | null;
  ask: number | null;
  last: number | null;
}

function token(): string | null {
  return process.env.TRADIER_SANDBOX_TOKEN?.trim() || null;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const auth = token();
  if (!auth) throw new Error("TRADIER_SANDBOX_TOKEN is not set");
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${auth}`, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

function toQuote(option: TradierOption): OptionQuote {
  return {
    strike: option.strike,
    bid: typeof option.bid === "number" ? option.bid : null,
    ask: typeof option.ask === "number" ? option.ask : null,
    lastPrice: typeof option.last === "number" ? option.last : null,
  };
}

/** The strike nearest `spot` quoted on both sides, as with the primary source. */
function atmSnapshot(
  expiry: string,
  options: TradierOption[],
  spot: number,
): OptionExpirySnapshot | null {
  const puts = new Map(
    options.filter((o) => o.option_type === "put").map((o) => [o.strike, o]),
  );
  let best: { call: TradierOption; put: TradierOption; gap: number } | null = null;
  for (const call of options.filter((o) => o.option_type === "call")) {
    const put = puts.get(call.strike);
    if (!put) continue;
    const gap = Math.abs(call.strike - spot);
    if (!best || gap < best.gap) best = { call, put, gap };
  }
  if (!best) return null;
  return {
    expiry,
    atmStrike: best.call.strike,
    call: toQuote(best.call),
    put: toQuote(best.put),
  };
}

export async function fetchTradierExpiries(
  symbol: string,
  asOf: string,
  spot: number,
  count: number = 2,
): Promise<Fetched<OptionExpirySnapshot[]>> {
  if (!token()) {
    return failed(
      "Options fallback needs TRADIER_SANDBOX_TOKEN, which is not set.",
    );
  }
  try {
    const listed = await get<{ expirations: { date: string[] } | null }>(
      "/options/expirations",
      { symbol, includeAllRoots: "true" },
    );
    const upcoming = (listed.expirations?.date ?? [])
      .filter((d) => d > asOf)
      .slice(0, count);
    if (upcoming.length === 0) {
      return failed(`Tradier listed no option expiry after ${asOf}.`);
    }

    const snapshots: OptionExpirySnapshot[] = [];
    for (const expiry of upcoming) {
      const chain = await get<{ options: { option: TradierOption[] } | null }>(
        "/options/chains",
        { symbol, expiration: expiry, greeks: "false" },
      );
      const snapshot = atmSnapshot(expiry, chain.options?.option ?? [], spot);
      if (snapshot) snapshots.push(snapshot);
    }
    if (snapshots.length === 0) {
      return failed("Tradier chains carried no matched call/put strike.");
    }
    return ok(snapshots);
  } catch (error) {
    return failed(reasonFrom(error, "Tradier sandbox unavailable"));
  }
}
