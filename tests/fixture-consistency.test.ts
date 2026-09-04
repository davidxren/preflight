import { describe, expect, it } from "vitest";
import { FIXTURE_SYMBOLS, fixtureFor } from "@/fixtures";
import type { MarketSnapshot } from "@/market/types";

/**
 * The committed sample-mode snapshots are what every default report reads, and
 * they are refreshed by hand with `npm run fixtures:refresh` (v1.1 D5). A
 * refresh that captured a stale earnings date or an expiry already settled
 * would render a report that looks fine and is wrong, so the internal
 * consistency of each snapshot is asserted here rather than eyeballed.
 */

function snapshot(symbol: string): MarketSnapshot {
  const fixture = fixtureFor(symbol);
  if (!fixture) throw new Error(`no fixture for ${symbol}`);
  return fixture;
}

describe("committed fixtures", () => {
  it("ships the four documented symbols", () => {
    expect(FIXTURE_SYMBOLS).toEqual(["AAPL", "NVDA", "SPY", "TSLA"]);
  });

  for (const symbol of ["AAPL", "NVDA", "SPY", "TSLA"]) {
    describe(symbol, () => {
      const fixture = snapshot(symbol);

      it("is a sample snapshot that names where it came from", () => {
        expect(fixture.symbol).toBe(symbol);
        expect(fixture.source).toBe("sample");
        expect(fixture.provenance.length).toBeGreaterThan(0);
        expect(fixture.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      it("carries bars in ascending date order, ending at its as-of date", () => {
        expect(fixture.bars.length).toBeGreaterThan(41);
        const dates = fixture.bars.map((b) => b.date);
        expect([...dates].sort()).toEqual(dates);
        expect(new Set(dates).size).toBe(dates.length);
        expect(fixture.asOf).toBe(dates[dates.length - 1]);
      });

      it("has four finite prices and a high at or above the low on every bar", () => {
        for (const bar of fixture.bars) {
          for (const value of [bar.open, bar.high, bar.low, bar.close]) {
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThan(0);
          }
          expect(bar.high).toBeGreaterThanOrEqual(bar.low);
          expect(bar.high).toBeGreaterThanOrEqual(bar.close);
          expect(bar.low).toBeLessThanOrEqual(bar.close);
        }
      });

      it("dates any earnings announcement after the as-of date", () => {
        if (fixture.nextEarningsDate === null) return;
        expect(fixture.asOf).not.toBeNull();
        expect(fixture.nextEarningsDate >= fixture.asOf!).toBe(true);
      });

      it("dates every option expiry strictly after the as-of date", () => {
        for (const expiry of fixture.expiries) {
          // An expiry on the as-of date settles that day, so its straddle no
          // longer prices a forward move.
          expect(expiry.expiry > fixture.asOf!).toBe(true);
        }
      });

      it("quotes the same strike on both legs of each expiry", () => {
        for (const expiry of fixture.expiries) {
          expect(expiry.call.strike).toBe(expiry.atmStrike);
          expect(expiry.put.strike).toBe(expiry.atmStrike);
        }
      });

      it("gives every field either a value or a recorded reason", () => {
        if (fixture.spot === null) expect(fixture.unavailable.spot).toBeTruthy();
        if (fixture.expiries.length === 0) {
          expect(fixture.unavailable.expiries).toBeTruthy();
        }
        if (fixture.dayGainers === null) {
          expect(fixture.unavailable.dayGainers).toBeTruthy();
        }
        // An ETF has no scheduled announcement, which is stated by the check
        // rather than recorded as unavailable, so it is exempt here.
        if (fixture.nextEarningsDate === null && fixture.instrumentType !== "ETF") {
          expect(fixture.unavailable.nextEarningsDate).toBeTruthy();
        }
      });
    });
  }

  it("captured every symbol at the same as-of date", () => {
    // The refresh writes nothing unless all four captured, so a split set
    // would mean a fixture was edited by hand.
    const asOf = new Set(
      ["AAPL", "NVDA", "SPY", "TSLA"].map((s) => snapshot(s).asOf),
    );
    expect(asOf.size).toBe(1);
  });
});
