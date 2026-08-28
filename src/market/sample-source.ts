import { FIXTURE_SYMBOLS, fixtureFor } from "@/fixtures";
import { failed, ok, type Fetched } from "./fetched";
import type { MarketSnapshot } from "./types";

/**
 * Sample mode, the default. Reads committed fixtures only — no network call is
 * possible from this path (CLAUDE.md §9).
 */
export function sampleSnapshot(symbol: string): Fetched<MarketSnapshot> {
  const snapshot = fixtureFor(symbol);
  if (!snapshot) {
    return failed(
      `Sample mode ships fixtures for ${FIXTURE_SYMBOLS.join(", ")} only. ` +
        `Set PREFLIGHT_DATA=live to look up other tickers.`,
    );
  }
  return ok(snapshot);
}
