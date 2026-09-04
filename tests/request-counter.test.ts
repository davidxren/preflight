import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { recordRequest, requestCounts } from "@/db/request-counter";

/**
 * The request counter (CLAUDE.md §10, owner amendment 6) — the only analytics
 * kept. What is asserted here is as much what it does not store as what it
 * does: no identifier of any kind, and no ability to take a report down.
 */

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "preflight-requests-"));
  process.env.PREFLIGHT_DB_PATH = join(dir, "test.db");
  migrate(db(), { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  delete process.env.PREFLIGHT_DB_PATH;
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  db().$client.prepare("DELETE FROM requests").run();
});

describe("the requests table", () => {
  it("holds only the four permitted facts, and no identifier", () => {
    const columns = db().$client.prepare("PRAGMA table_info(requests)").all() as {
      name: string;
    }[];
    // Copied from CLAUDE.md owner amendment 6: timestamp, ticker, action, mode,
    // plus the row's own id. Nothing that could identify who asked.
    expect(columns.map((c) => c.name).sort()).toEqual([
      "action",
      "created_at",
      "id",
      "mode",
      "symbol",
    ]);
  });
});

describe("recordRequest", () => {
  it("increments the count", () => {
    expect(requestCounts().total).toBe(0);
    recordRequest({ symbol: "AAPL", action: "buy call", mode: "sample" });
    expect(requestCounts().total).toBe(1);
    recordRequest({ symbol: "NVDA", action: "buy put", mode: "live" });
    expect(requestCounts().total).toBe(2);
  });

  it("normalises the ticker so one symbol is one tally", () => {
    recordRequest({ symbol: "aapl", action: "buy call", mode: "sample" });
    recordRequest({ symbol: "AAPL", action: "buy call", mode: "sample" });
    expect(requestCounts().bySymbol).toEqual([{ key: "AAPL", count: 2 }]);
  });

  it("groups by mode and by action, most frequent first", () => {
    recordRequest({ symbol: "AAPL", action: "buy call", mode: "sample" });
    recordRequest({ symbol: "NVDA", action: "buy call", mode: "sample" });
    recordRequest({ symbol: "SPY", action: "buy shares", mode: "live" });

    expect(requestCounts().byMode).toEqual([
      { key: "sample", count: 2 },
      { key: "live", count: 1 },
    ]);
    expect(requestCounts().byAction).toEqual([
      { key: "buy call", count: 2 },
      { key: "buy shares", count: 1 },
    ]);
  });

  it("stamps a time and reports the range", () => {
    const before = Date.now();
    recordRequest({ symbol: "AAPL", action: "buy call", mode: "sample" });
    const counts = requestCounts();
    expect(counts.firstAt).not.toBeNull();
    expect(counts.firstAt!).toBeGreaterThanOrEqual(before - 1_000);
    expect(counts.lastAt).toBeGreaterThanOrEqual(counts.firstAt!);
  });

  it("stores no sizing input and no visitor identifier", () => {
    recordRequest({ symbol: "AAPL", action: "buy call", mode: "sample" });
    const row = db().$client.prepare("SELECT * FROM requests LIMIT 1").get() as Record<
      string,
      unknown
    >;
    expect(Object.keys(row).sort()).toEqual([
      "action",
      "created_at",
      "id",
      "mode",
      "symbol",
    ]);
    // Nothing resembling equity, a win probability, a cookie, or an address.
    expect(JSON.stringify(row)).not.toMatch(/visitor|cookie|ip|equity|payoff|@/i);
  });

  it("counts a report built through the web action, in sample mode too", async () => {
    const { createReport } = await import("@/app/actions");

    const response = await createReport("AAPL", "buy call");
    expect(response.ok).toBe(true);

    const counts = requestCounts();
    expect(counts.total).toBe(1);
    // Production serves sample data, so sample-mode reports are the traffic
    // (CLAUDE.md amendment 6).
    expect(counts.byMode).toEqual([{ key: "sample", count: 1 }]);
    expect(counts.bySymbol).toEqual([{ key: "AAPL", count: 1 }]);
    expect(counts.byAction).toEqual([{ key: "buy call", count: 1 }]);
  });

  it("counts nothing for input the action rejects", async () => {
    const { createReport } = await import("@/app/actions");

    expect((await createReport("not a ticker", "buy call")).ok).toBe(false);
    expect((await createReport("AAPL", "sell everything")).ok).toBe(false);
    expect(requestCounts().total).toBe(0);
  });

  it("never takes a report down when the write fails", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    db().$client.prepare("ALTER TABLE requests RENAME TO requests_moved").run();
    try {
      expect(() =>
        recordRequest({ symbol: "AAPL", action: "buy call", mode: "sample" }),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("request counter unavailable, continuing"),
      );
    } finally {
      db().$client.prepare("ALTER TABLE requests_moved RENAME TO requests").run();
      warn.mockRestore();
    }
  });
});
