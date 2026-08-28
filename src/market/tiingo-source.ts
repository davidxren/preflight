import { toUtcIsoDate } from "@/engine/calendar";
import { failed, ok, reasonFrom, withOneRetry, type Fetched } from "./fetched";
import type { DailyBar } from "./types";

/**
 * End-of-day OHLC fallback (CLAUDE.md §9), used only when the primary source
 * fails and TIINGO_API_KEY is set. Tiingo's free tier covers daily history.
 * Without a key this reports why rather than returning anything.
 */

const BASE = "https://api.tiingo.com/tiingo/daily";
const TIMEOUT_MS = 15_000;

/** One row of Tiingo's daily prices response. */
interface TiingoBar {
  date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

function token(): string | null {
  return process.env.TIINGO_API_KEY?.trim() || null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function tiingoUrl(symbol: string, fromIsoDate: string): string {
  // The key travels in the Authorization header, never in the query string.
  return `${BASE}/${symbol.toLowerCase()}/prices?${new URLSearchParams({
    startDate: fromIsoDate,
    format: "json",
    resampleFreq: "daily",
  })}`;
}

/**
 * Maps Tiingo's rows onto daily bars. Rows missing any of OHLC are dropped
 * rather than patched, because a partial bar cannot be repaired without
 * inventing a number.
 */
export function parseTiingoBars(
  payload: unknown,
  fromIsoDate: string,
): Fetched<DailyBar[]> {
  if (!Array.isArray(payload)) {
    return failed("Tiingo response was not a list of daily bars.");
  }
  const bars: DailyBar[] = [];
  for (const row of payload as TiingoBar[]) {
    if (typeof row?.date !== "string") continue;
    // Tiingo stamps each row as an ISO datetime at UTC midnight.
    const date = toUtcIsoDate(new Date(row.date));
    if (Number.isNaN(Date.parse(row.date)) || date < fromIsoDate) continue;
    const open = finite(row.open);
    const high = finite(row.high);
    const low = finite(row.low);
    const close = finite(row.close);
    if (open === null || high === null || low === null || close === null) continue;
    bars.push({ date, open, high, low, close, volume: finite(row.volume) ?? 0 });
  }
  if (bars.length === 0) return failed("Tiingo returned no usable daily bars.");
  // Tiingo returns ascending order; sorting keeps that guarantee explicit.
  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return ok(bars);
}

export async function fetchTiingoBars(
  symbol: string,
  fromIsoDate: string,
): Promise<Fetched<DailyBar[]>> {
  const key = token();
  if (!key) {
    return failed("Price-history fallback needs TIINGO_API_KEY, which is not set.");
  }
  try {
    const payload = await withOneRetry(
      async () => {
        const response = await fetch(tiingoUrl(symbol, fromIsoDate), {
          headers: {
            Authorization: `Token ${key}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as unknown;
      },
      (error) =>
        console.warn(
          `[preflight] retrying tiingo(${symbol}): ${reasonFrom(error, "cause")}`,
        ),
    );
    return parseTiingoBars(payload, fromIsoDate);
  } catch (error) {
    return failed(reasonFrom(error, "Tiingo unavailable"));
  }
}
