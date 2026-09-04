/**
 * Captures the sample-mode fixtures from the live Yahoo source and writes them
 * to src/fixtures. Run by hand when the snapshot should be refreshed; the
 * committed JSON is what sample mode reads, so the app itself never needs the
 * network (CLAUDE.md §9: never call any network in sample mode).
 *
 * Gate G1 is checked first, and nothing is written unless every symbol was
 * captured: a half-refreshed fixture set would mix two as-of dates.
 *
 * Usage: npm run fixtures:refresh [-- SYMBOL ...]
 */
import { writeFileSync } from "node:fs";
import { toIsoDate } from "@/engine/calendar";
import { GATE_G1_FAILED, probePrimarySource } from "@/market/snapshot-source";
import {
  fetchDailyBars,
  fetchDayGainers,
  fetchNextEarningsDate,
  fetchOptionExpiries,
  fetchSpot,
} from "@/market/yahoo-source";
import type { MarketSnapshot, UnavailableReasons } from "@/market/types";

const DEFAULT_SYMBOLS = ["AAPL", "NVDA", "TSLA", "SPY"];
const HISTORY_YEARS = 10;

async function capture(
  symbol: string,
  gainers: string[] | null,
  gainersReason: string | undefined,
): Promise<MarketSnapshot> {
  const capturedAt = new Date();
  const from = toIsoDate(
    new Date(capturedAt.getTime() - HISTORY_YEARS * 365.25 * 86_400_000),
  );
  const unavailable: UnavailableReasons = {};
  if (gainersReason) unavailable.dayGainers = gainersReason;

  const barsResult = await fetchDailyBars(symbol, from);
  if (!barsResult.ok) unavailable.bars = barsResult.reason;
  const bars = barsResult.ok ? barsResult.value : [];
  const asOf = bars.length > 0 ? bars[bars.length - 1].date : null;

  const spotResult = await fetchSpot(symbol);
  if (!spotResult.ok) unavailable.spot = spotResult.reason;
  const spot = spotResult.ok ? spotResult.value.price : null;
  const instrumentType = spotResult.ok ? spotResult.value.instrumentType : null;

  let expiries: MarketSnapshot["expiries"] = [];
  if (spot !== null && asOf !== null) {
    const chains = await fetchOptionExpiries(symbol, asOf, spot);
    if (chains.ok) expiries = chains.value;
    else unavailable.expiries = chains.reason;
  } else {
    unavailable.expiries = "No spot price to locate the at-the-money strike";
  }

  let nextEarningsDate: string | null = null;
  let earningsDateIsEstimate = false;
  if (asOf !== null) {
    const earnings = await fetchNextEarningsDate(symbol, asOf);
    if (earnings.ok) {
      nextEarningsDate = earnings.value.date;
      earningsDateIsEstimate = earnings.value.isEstimate;
    } else {
      unavailable.nextEarningsDate = earnings.reason;
    }
  } else {
    unavailable.nextEarningsDate = "No trading date to compare an earnings date against";
  }

  return {
    symbol,
    source: "sample",
    provenance: `Captured from Yahoo Finance on ${capturedAt.toISOString()}`,
    capturedAt: capturedAt.toISOString(),
    asOf,
    spot,
    instrumentType,
    bars,
    expiries,
    nextEarningsDate,
    earningsDateIsEstimate,
    dayGainers: gainers,
    unavailable,
  };
}

async function main(): Promise<void> {
  const symbols = process.argv.slice(2).length
    ? process.argv.slice(2).map((s) => s.toUpperCase())
    : DEFAULT_SYMBOLS;

  // Gate G1 before anything is captured, so an unreachable source leaves the
  // committed fixtures exactly as they were.
  const gate = await probePrimarySource();
  if (gate !== null) {
    console.error(`${GATE_G1_FAILED}\nReason: ${gate}`);
    console.error("Fixtures were left untouched.");
    process.exitCode = 1;
    return;
  }

  const gainersResult = await fetchDayGainers(50);
  const gainers = gainersResult.ok ? gainersResult.value : null;
  if (!gainersResult.ok) {
    console.warn(`[fixtures] day gainers: ${gainersResult.reason}`);
  }

  // Captured in full first: a symbol that fails part-way must not leave the
  // set split across two as-of dates.
  const captured: { symbol: string; snapshot: MarketSnapshot }[] = [];
  for (const symbol of symbols) {
    const snapshot = await capture(
      symbol,
      gainers,
      gainersResult.ok ? undefined : gainersResult.reason,
    );
    if (snapshot.bars.length === 0) {
      console.error(
        `[fixtures] ${symbol}: no price history (${snapshot.unavailable.bars ?? "no reason given"}).`,
      );
      console.error("Fixtures were left untouched.");
      process.exitCode = 1;
      return;
    }
    captured.push({ symbol, snapshot });
  }

  for (const { symbol, snapshot } of captured) {
    const path = `src/fixtures/${symbol.toLowerCase()}.json`;
    writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(
      `[fixtures] ${symbol}: ${snapshot.bars.length} bars ${snapshot.asOf ?? "no asOf"}, ` +
        `spot ${snapshot.spot ?? "n/a"}, expiries ${snapshot.expiries.length}, ` +
        `earnings ${snapshot.nextEarningsDate ?? "n/a"}, ` +
        `unavailable [${Object.keys(snapshot.unavailable).join(", ") || "none"}]`,
    );
  }

  const asOfDates = [...new Set(captured.map((c) => c.snapshot.asOf ?? "unknown"))];
  console.log(`\n[fixtures] refreshed ${captured.length}; as of ${asOfDates.join(", ")}`);
}

main().catch((error) => {
  console.error("[fixtures] failed:", error);
  process.exitCode = 1;
});
