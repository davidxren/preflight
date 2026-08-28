import { liveSnapshot } from "./live-snapshot";
import { sampleSnapshot } from "./sample-source";
import { failed, ok, reasonFrom, type Fetched } from "./fetched";
import type { MarketSnapshot } from "./types";

/**
 * Chooses the data source. Sample mode is the default and needs no keys and no
 * network; live mode is opt-in through PREFLIGHT_DATA=live and is gated
 * (CLAUDE.md §9, gate G1).
 */
export type DataMode = "sample" | "live";

/** Printed verbatim when gate G1 fails; the CLI and the app both match on it. */
export const GATE_G1_FAILED = "GATE FAILED: live data unreachable";

/** A cheap, keyless probe of the primary source's reachability. */
const DEFAULT_PROBE_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d";
const PROBE_TIMEOUT_MS = 8_000;

/**
 * Overridable so gate G1's failure path can be exercised without unplugging
 * the machine, which is the only other way to observe it.
 */
export function probeUrl(
  env: Pick<NodeJS.ProcessEnv, "PREFLIGHT_PROBE_URL"> = process.env,
): string {
  return env.PREFLIGHT_PROBE_URL?.trim() || DEFAULT_PROBE_URL;
}

export function dataMode(
  env: Pick<NodeJS.ProcessEnv, "PREFLIGHT_DATA"> = process.env,
): DataMode {
  return env.PREFLIGHT_DATA === "live" ? "live" : "sample";
}

/**
 * Gate G1. Returns null when the primary source answers, or the reason it did
 * not. Never throws: an unreachable source must fall back, not crash.
 */
export async function probePrimarySource(): Promise<string | null> {
  try {
    const response = await fetch(probeUrl(), {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.ok ? null : `primary source returned HTTP ${response.status}`;
  } catch (error) {
    return reasonFrom(error, "primary source unreachable");
  }
}

export interface ResolvedSnapshot {
  snapshot: MarketSnapshot;
  /** The mode actually used, which differs from the request when G1 fails. */
  mode: DataMode;
  /** Set when live mode was requested but the gate sent the run to sample. */
  gateFailure?: string;
}

/**
 * Resolves a snapshot for `symbol`. In live mode the primary source is probed
 * first; if the gate fails the caller is told, and the run continues on sample
 * data rather than on invented numbers.
 */
export async function resolveSnapshot(
  symbol: string,
  mode: DataMode = dataMode(),
  probe: () => Promise<string | null> = probePrimarySource,
): Promise<Fetched<ResolvedSnapshot>> {
  if (mode === "sample") {
    const sample = sampleSnapshot(symbol);
    return sample.ok ? ok({ snapshot: sample.value, mode: "sample" }) : sample;
  }

  const gateFailure = await probe();
  if (gateFailure !== null) {
    const sample = sampleSnapshot(symbol);
    if (!sample.ok) {
      return failed(`${GATE_G1_FAILED}. ${sample.reason}`);
    }
    return ok({ snapshot: sample.value, mode: "sample", gateFailure });
  }

  const live = await liveSnapshot(symbol);
  return live.ok ? ok({ snapshot: live.value, mode: "live" }) : live;
}
