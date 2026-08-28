import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { cacheKey, readCache, writeCache } from "@/db/response-cache";
import { joinWaitlist } from "@/db/waitlist-store";
import { parseStooqCsv, stooqUrl } from "@/market/stooq-source";
import { sampleSnapshot } from "@/market/sample-source";
import {
  GATE_G1_FAILED,
  dataMode,
  resolveSnapshot,
} from "@/market/snapshot-source";

let dir: string;

beforeAll(() => {
  // A throwaway database per run, so the suite never touches ./preflight.db.
  dir = mkdtempSync(join(tmpdir(), "preflight-test-"));
  process.env.PREFLIGHT_DB_PATH = join(dir, "test.db");
  migrate(db(), { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  delete process.env.PREFLIGHT_DB_PATH;
  rmSync(dir, { recursive: true, force: true });
});

describe("migrations", () => {
  it("creates exactly the cache and waitlist tables", () => {
    const tables = db()
      .$client.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
      )
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(["cache", "waitlist"]);
  });
});

describe("response cache", () => {
  it("round-trips a payload", () => {
    const key = cacheKey("yahoo", "aapl", "bars");
    writeCache(key, { bars: [1, 2, 3] });
    expect(readCache<{ bars: number[] }>(key)?.bars).toEqual([1, 2, 3]);
  });

  it("namespaces by source, symbol, and part", () => {
    expect(cacheKey("yahoo", "aapl", "bars")).toBe("yahoo:AAPL:bars");
    expect(cacheKey("yahoo", "AAPL", "bars")).toBe(cacheKey("yahoo", "aapl", "bars"));
  });

  it("misses once the entry is older than the ttl", () => {
    const key = cacheKey("yahoo", "nvda", "quote");
    writeCache(key, { price: 1 }, 1_000);
    // Age is 1,000 ms at now=2,000: outside a 500 ms ttl, inside a 5,000 ms one.
    expect(readCache(key, 500, 2_000)).toBeNull();
    expect(readCache(key, 5_000, 2_000)).not.toBeNull();
  });

  it("overwrites an existing key rather than failing", () => {
    const key = cacheKey("yahoo", "tsla", "quote");
    writeCache(key, { price: 1 });
    writeCache(key, { price: 2 });
    expect(readCache<{ price: number }>(key)?.price).toBe(2);
  });

  it("misses on a key that was never written", () => {
    expect(readCache(cacheKey("yahoo", "zzzz", "bars"))).toBeNull();
  });
});

describe("waitlist", () => {
  it("stores a valid address", () => {
    expect(joinWaitlist("someone@example.com")).toEqual({
      ok: true,
      alreadyJoined: false,
    });
  });

  it("treats a repeat sign-up as already joined, not an error", () => {
    joinWaitlist("repeat@example.com");
    expect(joinWaitlist("repeat@example.com")).toEqual({
      ok: true,
      alreadyJoined: true,
    });
  });

  it("normalises case and surrounding space", () => {
    joinWaitlist("  Mixed@Example.COM ");
    const repeat = joinWaitlist("mixed@example.com");
    expect(repeat.ok).toBe(true);
    expect(repeat.ok && repeat.alreadyJoined).toBe(true);
  });

  it("rejects an address that is not one", () => {
    expect(joinWaitlist("nope").ok).toBe(false);
    expect(joinWaitlist("a@b").ok).toBe(false);
    expect(joinWaitlist("").ok).toBe(false);
  });

  it("stores no sizing numbers alongside the email", () => {
    const columns = db().$client.prepare("PRAGMA table_info(waitlist)").all() as {
      name: string;
    }[];
    expect(columns.map((c) => c.name).sort()).toEqual([
      "created_at",
      "email",
      "id",
    ]);
  });
});

describe("Stooq fallback", () => {
  it("builds the documented url", () => {
    expect(stooqUrl("AAPL")).toBe("https://stooq.com/q/d/l/?s=aapl.us&i=d");
  });

  it("parses daily csv rows", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "2026-08-27,1,2,0.5,1.5,100",
      "2026-08-28,1.5,2.5,1,2,200",
    ].join("\n");
    const result = parseStooqCsv(csv, "2026-08-27");
    expect(result.ok && result.value).toHaveLength(2);
  });

  it("drops rows before the requested start date", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "2015-01-02,1,2,0.5,1.5,100",
      "2026-08-28,1.5,2.5,1,2,200",
    ].join("\n");
    const result = parseStooqCsv(csv, "2026-01-01");
    expect(result.ok && result.value.map((b) => b.date)).toEqual(["2026-08-28"]);
  });

  it("names the browser-verification challenge rather than parsing it", () => {
    const result = parseStooqCsv(
      '<!DOCTYPE html><html><body><script>verify()</script></body></html>',
      "2026-01-01",
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(
      "browser-verification challenge",
    );
  });

  it("reports rather than invents when no row is usable", () => {
    const csv = "Date,Open,High,Low,Close,Volume\n2026-08-28,x,y,z,w,v";
    expect(parseStooqCsv(csv, "2026-01-01").ok).toBe(false);
  });
});

describe("data mode and gate G1", () => {
  it("defaults to sample mode", () => {
    expect(dataMode({})).toBe("sample");
    expect(dataMode({ PREFLIGHT_DATA: "sample" })).toBe("sample");
    expect(dataMode({ PREFLIGHT_DATA: "LIVE" })).toBe("sample");
  });

  it("enters live mode only on the exact opt-in value", () => {
    expect(dataMode({ PREFLIGHT_DATA: "live" })).toBe("live");
  });

  it("never probes the network in sample mode", async () => {
    let probed = false;
    const resolved = await resolveSnapshot("AAPL", "sample", async () => {
      probed = true;
      return null;
    });
    expect(probed).toBe(false);
    expect(resolved.ok && resolved.value.mode).toBe("sample");
  });

  it("falls back to sample data when the gate fails", async () => {
    const resolved = await resolveSnapshot("AAPL", "live", async () => "host down");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.mode).toBe("sample");
    expect(resolved.value.gateFailure).toBe("host down");
    expect(resolved.value.snapshot.source).toBe("sample");
  });

  it("keeps the gate line exactly as specified", () => {
    expect(GATE_G1_FAILED).toBe("GATE FAILED: live data unreachable");
  });

  it("reports an unknown ticker in sample mode instead of inventing one", () => {
    const result = sampleSnapshot("ZZZZ");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("AAPL, NVDA, SPY, TSLA");
  });
});
