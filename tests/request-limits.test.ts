import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { recordPrediction } from "@/calibration/prediction-store";
import {
  LIVE_REPORTS_PER_MINUTE,
  MAX_UNSETTLED_PREDICTIONS,
  atUnsettledLimit,
  rateLimitMessage,
  takeLiveReport,
  unsettledLimitMessage,
} from "@/limits/request-limits";
import { TokenBucket } from "@/limits/token-bucket";

/**
 * The abuse bounds (v1.1 D8). Each bound gets a test, and each over-limit
 * response is checked for what it must not contain: a report, or a number the
 * engine never computed.
 */

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
  headers: async () => new Map<string, string>(),
}));

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "preflight-limits-"));
  process.env.PREFLIGHT_DB_PATH = join(dir, "test.db");
  migrate(db(), { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  delete process.env.PREFLIGHT_DB_PATH;
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  jar.clear();
  db().$client.prepare("DELETE FROM predictions").run();
  db().$client.prepare("DELETE FROM waitlist").run();
});

describe("the token bucket", () => {
  it("allows the capacity and refuses the next call", () => {
    const bucket = new TokenBucket({ capacity: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i += 1) {
      expect(bucket.take("1.2.3.4", 0).allowed).toBe(true);
    }
    const refused = bucket.take("1.2.3.4", 0);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills over the window", () => {
    const bucket = new TokenBucket({ capacity: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i += 1) bucket.take("1.2.3.4", 0);
    expect(bucket.take("1.2.3.4", 0).allowed).toBe(false);
    // One token is worth a tenth of the window.
    expect(bucket.take("1.2.3.4", 6_000).allowed).toBe(true);
    expect(bucket.take("1.2.3.4", 60_000).allowed).toBe(true);
  });

  it("keeps one caller's spending off another's", () => {
    const bucket = new TokenBucket({ capacity: 2, windowMs: 60_000 });
    expect(bucket.take("a", 0).allowed).toBe(true);
    expect(bucket.take("a", 0).allowed).toBe(true);
    expect(bucket.take("a", 0).allowed).toBe(false);
    expect(bucket.take("b", 0).allowed).toBe(true);
  });

  it("forgets the least recently seen caller rather than growing without bound", () => {
    const bucket = new TokenBucket({ capacity: 1, windowMs: 60_000, maxCallers: 3 });
    for (const caller of ["a", "b", "c", "d", "e"]) bucket.take(caller, 0);
    expect(bucket.size()).toBe(3);
    // The evicted caller starts fresh, which is the cost of the bound.
    expect(bucket.take("a", 0).allowed).toBe(true);
  });
});

describe("the live-report rate limit", () => {
  it("is the owner's ten a minute", () => {
    expect(LIVE_REPORTS_PER_MINUTE).toBe(10);
  });

  it("refuses the eleventh call from one address inside a minute", () => {
    const caller = "203.0.113.7";
    for (let i = 0; i < LIVE_REPORTS_PER_MINUTE; i += 1) {
      expect(takeLiveReport(caller, 1_000).allowed).toBe(true);
    }
    const refused = takeLiveReport(caller, 1_000);
    expect(refused.allowed).toBe(false);
    expect(refused.message).toBe(rateLimitMessage(LIVE_REPORTS_PER_MINUTE));
  });

  it("describes the limit in a sentence, with no fabricated figure", () => {
    const message = rateLimitMessage(LIVE_REPORTS_PER_MINUTE);
    expect(message).toMatch(/^Live data is limited to 10 reports a minute/);
    expect(message).toMatch(/\.$/);
    // The only number in the message is the limit itself.
    expect(message.match(/\d+/g)).toEqual(["10"]);
    expect(message).not.toMatch(/[A-Z]{2,}/);
  });
});

describe("the unsettled-forecast cap", () => {
  it("is the owner's twenty", () => {
    expect(MAX_UNSETTLED_PREDICTIONS).toBe(20);
    expect(atUnsettledLimit(19)).toBe(false);
    expect(atUnsettledLimit(20)).toBe(true);
    expect(atUnsettledLimit(21)).toBe(true);
  });

  it("refuses a twenty-first forecast and stores nothing further", () => {
    const visitor = "visitor-at-the-cap";
    jar.set("preflight_calibration_id", visitor);
    for (let i = 0; i < MAX_UNSETTLED_PREDICTIONS; i += 1) {
      recordPrediction({
        visitorId: visitor,
        symbol: "AAPL",
        direction: "up",
        confidence: 0.6,
        // Far enough out that none of them can settle.
        resolveAfter: "2099-01-01",
        baseClose: 100,
      });
    }

    return import("@/app/calibration-actions").then(async ({ submitPrediction }) => {
      const form = new FormData();
      form.append("symbol", "AAPL");
      form.append("direction", "up");
      form.append("confidence", "60");

      const result = await submitPrediction(null, form);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(unsettledLimitMessage(MAX_UNSETTLED_PREDICTIONS));
      }

      const count = (
        db()
          .$client.prepare("SELECT COUNT(*) AS c FROM predictions WHERE visitor_id = ?")
          .get(visitor) as { c: number }
      ).c;
      expect(count).toBe(MAX_UNSETTLED_PREDICTIONS);
    });
  });

  it("lets a visitor below the cap record a forecast", async () => {
    jar.set("preflight_calibration_id", "visitor-below-the-cap");
    const { submitPrediction } = await import("@/app/calibration-actions");
    const form = new FormData();
    form.append("symbol", "AAPL");
    form.append("direction", "down");
    form.append("confidence", "70");

    const result = await submitPrediction(null, form);
    expect(result.ok).toBe(true);
  });

  it("describes the cap in a sentence, with no fabricated figure", () => {
    const message = unsettledLimitMessage(MAX_UNSETTLED_PREDICTIONS);
    expect(message).toMatch(/^You already have 20 forecasts waiting to settle/);
    expect(message).toMatch(/\.$/);
    expect(message.match(/\d+/g)).toEqual(["20"]);
  });
});

describe("the waitlist bound", () => {
  it("has a unique index on the email column", () => {
    const indexes = db().$client.prepare("PRAGMA index_list(waitlist)").all() as {
      name: string;
      unique: number;
    }[];
    const unique = indexes.filter((i) => i.unique === 1);
    expect(unique.length).toBeGreaterThan(0);

    const columns = unique.flatMap(
      (index) =>
        (
          db().$client.prepare(`PRAGMA index_info(${index.name})`).all() as {
            name: string;
          }[]
        ).map((c) => c.name),
    );
    expect(columns).toContain("email");
  });

  it("treats a duplicate as success without writing a second row", async () => {
    const { submitWaitlist } = await import("@/app/actions");
    const form = (email: string): FormData => {
      const data = new FormData();
      data.append("email", email);
      return data;
    };

    const first = await submitWaitlist(null, form("reader@example.test"));
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.message).toBe("Added to the list.");

    for (const variant of ["reader@example.test", "READER@EXAMPLE.TEST", " reader@example.test "]) {
      const again = await submitWaitlist(null, form(variant));
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.message).toBe("That address is already on the list.");
    }

    const count = (
      db().$client.prepare("SELECT COUNT(*) AS c FROM waitlist").get() as { c: number }
    ).c;
    expect(count).toBe(1);
  });
});
