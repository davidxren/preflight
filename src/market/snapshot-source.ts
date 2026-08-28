import { sampleSnapshot } from "./sample-source";
import type { Fetched } from "./fetched";
import type { MarketSnapshot } from "./types";

/**
 * Chooses the data source. Sample mode is the default and requires no keys and
 * no network; live mode is opt-in through PREFLIGHT_DATA=live (CLAUDE.md §9).
 */
export type DataMode = "sample" | "live";

export function dataMode(env: NodeJS.ProcessEnv = process.env): DataMode {
  return env.PREFLIGHT_DATA === "live" ? "live" : "sample";
}

export async function resolveSnapshot(
  symbol: string,
  mode: DataMode = dataMode(),
): Promise<Fetched<MarketSnapshot>> {
  if (mode === "sample") return sampleSnapshot(symbol);
  throw new Error("Live mode is not wired up yet.");
}
