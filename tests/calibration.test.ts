import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brierTerm, probabilityOfUp, summarize } from "@/calibration/brier";
import { recordPrediction, predictionsFor } from "@/calibration/prediction-store";
import {
  outcomeOf,
  resolveAndSummarize,
  settlingBar,
} from "@/calibration/resolve-predictions";
import { db } from "@/db/client";
import { addTradingSessions } from "@/engine/trading-calendar";
import type { DailyBar } from "@/market/types";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "preflight-calibration-"));
  process.env.PREFLIGHT_DB_PATH = join(dir, "test.db");
  migrate(db(), { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  delete process.env.PREFLIGHT_DB_PATH;
  rmSync(dir, { recursive: true, force: true });
});

function series(closes: number[]): DailyBar[] {
  return closes.map((c, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 1,
  }));
}

describe("Brier scoring", () => {
  it("converts a down call into the probability of up", () => {
    expect(probabilityOfUp("up", 0.7)).toBeCloseTo(0.7, 12);
    expect(probabilityOfUp("down", 0.7)).toBeCloseTo(0.3, 12);
  });

  it("scores a certain correct call at zero and a certain wrong one at one", () => {
    expect(brierTerm(1, true)).toBe(0);
    expect(brierTerm(1, false)).toBe(1);
  });

  it("scores a coin flip at 0.25 either way", () => {
    expect(brierTerm(0.5, true)).toBeCloseTo(0.25, 12);
    expect(brierTerm(0.5, false)).toBeCloseTo(0.25, 12);
  });

  it("averages over resolved forecasts", () => {
    const summary = summarize([
      { probabilityUp: 1, wentUp: true },
      { probabilityUp: 0, wentUp: true },
    ]);
    expect(summary.resolved).toBe(2);
    expect(summary.brierScore).toBeCloseTo(0.5, 12);
    expect(summary.observedUpRate).toBeCloseTo(1, 12);
  });

  it("reports nothing rather than zero when nothing has settled", () => {
    const summary = summarize([]);
    expect(summary.resolved).toBe(0);
    expect(summary.brierScore).toBeNull();
    expect(summary.baseRateBrier).toBeNull();
  });
});

describe("lazy resolution", () => {
  const bars = series([100, 101, 102, 103, 104, 110, 111]);

  it("settles on the first bar at or after the resolve-after date", () => {
    expect(settlingBar(bars, "2026-01-06")?.close).toBe(110);
  });

  it("settles on the next bar when the resolve-after date has no bar", () => {
    // A holiday or halt means the exact date may never print.
    expect(settlingBar(bars, "2026-01-05")?.close).toBe(104);
  });

  it("returns null while the window is still open", () => {
    expect(settlingBar(bars, "2026-02-01")).toBeNull();
  });

  it("treats a flat close as not a rise", () => {
    expect(outcomeOf(100, 101)).toBe("up");
    expect(outcomeOf(100, 100)).toBe("down");
    expect(outcomeOf(100, 99)).toBe("down");
  });

  it("settles a forecast once the window closes and scores it", () => {
    recordPrediction({
      visitorId: "visitor-a",
      symbol: "TEST",
      direction: "up",
      confidence: 0.8,
      resolveAfter: "2026-01-06",
      baseClose: 100,
    });
    const view = resolveAndSummarize("visitor-a", "TEST", bars);
    expect(view.resolved).toBe(1);
    expect(view.pending).toBe(0);
    // Settled at 110 from 100, so the "up" call was right: (0.8 - 1)^2 = 0.04.
    expect(view.brierScore).toBeCloseTo(0.04, 12);
  });

  it("leaves a forecast pending while its window is open", () => {
    recordPrediction({
      visitorId: "visitor-b",
      symbol: "TEST",
      direction: "down",
      confidence: 0.9,
      resolveAfter: "2026-03-01",
      baseClose: 110,
    });
    const view = resolveAndSummarize("visitor-b", "TEST", bars);
    expect(view.resolved).toBe(0);
    expect(view.pending).toBe(1);
    expect(view.brierScore).toBeNull();
  });

  it("writes the outcome back so it is not recomputed", () => {
    resolveAndSummarize("visitor-a", "TEST", bars);
    const [row] = predictionsFor("visitor-a");
    expect(row.outcome).toBe("up");
  });

  it("keeps one visitor's forecasts out of another's score", () => {
    expect(resolveAndSummarize("visitor-c", "TEST", bars).resolved).toBe(0);
  });

  it("does not settle a forecast against another ticker's bars", () => {
    recordPrediction({
      visitorId: "visitor-d",
      symbol: "OTHER",
      direction: "up",
      confidence: 0.7,
      resolveAfter: "2026-01-06",
      baseClose: 100,
    });
    expect(resolveAndSummarize("visitor-d", "TEST", bars).pending).toBe(1);
  });

  it("stores only the fields the amended persistence rule permits", () => {
    const columns = db().$client.prepare("PRAGMA table_info(predictions)").all() as {
      name: string;
    }[];
    expect(columns.map((c) => c.name).sort()).toEqual([
      "base_close",
      "confidence",
      "created_at",
      "direction",
      "id",
      "outcome",
      "resolve_after",
      "symbol",
      "visitor_id",
    ]);
  });
});

describe("trading-session arithmetic", () => {
  it("counts the resolve-after date in sessions, not calendar days", () => {
    // 2026-08-28 is a Friday; five sessions later is 2026-09-04.
    expect(addTradingSessions("2026-08-28", 5)).toBe("2026-09-04");
  });

  it("steps over a holiday", () => {
    // 2026-09-07 is Labor Day.
    expect(addTradingSessions("2026-09-04", 1)).toBe("2026-09-08");
  });
});
