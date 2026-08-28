import aapl from "./aapl.json";
import nvda from "./nvda.json";
import spy from "./spy.json";
import tsla from "./tsla.json";
import type { MarketSnapshot } from "@/market/types";

/**
 * Sample-mode data: real snapshots captured once from the live source by
 * scripts/build-fixtures.ts and committed. Sample mode reads only these, so
 * the default path never touches the network (CLAUDE.md §9).
 */
const FIXTURES: Readonly<Record<string, MarketSnapshot>> = {
  AAPL: aapl as MarketSnapshot,
  NVDA: nvda as MarketSnapshot,
  SPY: spy as MarketSnapshot,
  TSLA: tsla as MarketSnapshot,
};

export const FIXTURE_SYMBOLS: readonly string[] = Object.keys(FIXTURES).sort();

export function fixtureFor(symbol: string): MarketSnapshot | null {
  return FIXTURES[symbol.trim().toUpperCase()] ?? null;
}
