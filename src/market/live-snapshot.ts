import { toIsoDate } from "@/engine/calendar";
import { cacheKey, readCache, writeCache } from "@/db/response-cache";
import { fetchFinnhubEarningsDate } from "./finnhub-source";
import { failed, ok, type Fetched } from "./fetched";
import { fetchTiingoBars } from "./tiingo-source";
import { TRADIER_DELAY_NOTE, fetchTradierExpiries } from "./tradier-source";
import type {
  MarketSnapshot,
  OptionExpirySnapshot,
  UnavailableReasons,
} from "./types";
import {
  fetchDailyBars,
  fetchDayGainers,
  fetchNextEarningsDate,
  fetchOptionExpiries,
  fetchSpot,
} from "./yahoo-source";

/**
 * Live mode (CLAUDE.md §9). Each field is fetched from its primary source and,
 * on failure, from its documented fallback. When both fail the field carries a
 * reason and the report renders `Data unavailable` — nothing is ever invented.
 *
 * Successful responses are cached in SQLite because the primary source is
 * unofficial, rate-limits, and depends on a crumb that expires in minutes.
 */

const HISTORY_YEARS = 10;

/** Runs a fetch through the cache, storing only successes. */
async function cached<T>(
  key: string,
  fetcher: () => Promise<Fetched<T>>,
): Promise<Fetched<T>> {
  const hit = readCache<T>(key);
  if (hit !== null) return ok(hit);
  const result = await fetcher();
  if (result.ok) writeCache(key, result.value);
  return result;
}

/** Both sources failed; the report shows why each one did. */
function bothFailed(primary: string, fallback: string): string {
  return `${primary} Fallback: ${fallback}`;
}

export async function liveSnapshot(
  symbol: string,
): Promise<Fetched<MarketSnapshot>> {
  const capturedAt = new Date();
  const historyFrom = toIsoDate(
    new Date(capturedAt.getTime() - HISTORY_YEARS * 365.25 * 86_400_000),
  );
  const unavailable: UnavailableReasons = {};
  const notes: string[] = [];

  const barsPrimary = await cached(cacheKey("yahoo", symbol, "bars"), () =>
    fetchDailyBars(symbol, historyFrom),
  );
  let bars = barsPrimary.ok ? barsPrimary.value : [];
  if (!barsPrimary.ok) {
    const fallback = await cached(cacheKey("tiingo", symbol, "bars"), () =>
      fetchTiingoBars(symbol, historyFrom),
    );
    if (fallback.ok) {
      bars = fallback.value;
      notes.push("Price history came from the Tiingo fallback.");
    } else {
      unavailable.bars = bothFailed(barsPrimary.reason, fallback.reason);
    }
  }
  // A snapshot with no price history cannot support four of the six checks,
  // so it is reported as a failure rather than as a mostly-empty report.
  if (bars.length === 0) {
    return failed(
      unavailable.bars ?? `No price history could be loaded for ${symbol}.`,
    );
  }
  const asOf = bars[bars.length - 1].date;

  const quote = await cached(cacheKey("yahoo", symbol, "quote"), () =>
    fetchSpot(symbol),
  );
  // The last close is a real observed price, not an estimate, so it stands in
  // for the spot when the quote endpoint is down.
  const spot = quote.ok ? quote.value.price : bars[bars.length - 1].close;
  const instrumentType = quote.ok ? quote.value.instrumentType : null;
  if (!quote.ok) {
    notes.push(`Spot is the ${asOf} close; the live quote failed.`);
  }

  let expiries: OptionExpirySnapshot[] = [];
  const chainsPrimary = await cached(cacheKey("yahoo", symbol, "options"), () =>
    fetchOptionExpiries(symbol, asOf, spot),
  );
  if (chainsPrimary.ok) {
    expiries = chainsPrimary.value;
  } else {
    const fallback = await cached(cacheKey("tradier", symbol, "options"), () =>
      fetchTradierExpiries(symbol, asOf, spot),
    );
    if (fallback.ok) {
      expiries = fallback.value;
      notes.push(TRADIER_DELAY_NOTE);
    } else {
      unavailable.expiries = bothFailed(chainsPrimary.reason, fallback.reason);
    }
  }

  let nextEarningsDate: string | null = null;
  let earningsDateIsEstimate = false;
  const earningsPrimary = await cached(cacheKey("yahoo", symbol, "earnings"), () =>
    fetchNextEarningsDate(symbol, asOf),
  );
  if (earningsPrimary.ok) {
    nextEarningsDate = earningsPrimary.value.date;
    earningsDateIsEstimate = earningsPrimary.value.isEstimate;
  } else {
    const fallback = await cached(cacheKey("finnhub", symbol, "earnings"), () =>
      fetchFinnhubEarningsDate(symbol, asOf),
    );
    if (fallback.ok) {
      nextEarningsDate = fallback.value;
      notes.push("The earnings date came from the Finnhub fallback.");
    } else {
      unavailable.nextEarningsDate = bothFailed(
        earningsPrimary.reason,
        fallback.reason,
      );
    }
  }

  // The day-gainers screen has no documented fallback (CLAUDE.md §9).
  const gainers = await cached(cacheKey("yahoo", "market", "day_gainers"), () =>
    fetchDayGainers(),
  );
  if (!gainers.ok) unavailable.dayGainers = gainers.reason;

  return ok({
    symbol: symbol.toUpperCase(),
    source: "live",
    provenance: [`Fetched live at ${capturedAt.toISOString()}`, ...notes].join(" "),
    capturedAt: capturedAt.toISOString(),
    asOf,
    spot,
    instrumentType,
    bars,
    expiries,
    nextEarningsDate,
    earningsDateIsEstimate,
    dayGainers: gainers.ok ? gainers.value : null,
    unavailable,
  });
}
