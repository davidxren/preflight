import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { recordRequest } from "@/db/request-counter";

/**
 * `--stats` reads the counter and nothing else (CLAUDE.md amendment 6). The
 * cases that matter are the two side effects it must not have: running the CLI
 * to build a report must not add to the count, and asking for the count must
 * not add to it either.
 */

let dir: string;
let dbPath: string;

function run(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", "scripts/preflight-cli.ts", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, PREFLIGHT_DATA: "sample", PREFLIGHT_DB_PATH: dbPath },
    });
    return { stdout, status: 0 };
  } catch (error) {
    const e = error as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

function total(): number {
  return (
    db().$client.prepare("SELECT COUNT(*) AS c FROM requests").get() as { c: number }
  ).c;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "preflight-cli-stats-"));
  dbPath = join(dir, "test.db");
  process.env.PREFLIGHT_DB_PATH = dbPath;
  migrate(db(), { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  delete process.env.PREFLIGHT_DB_PATH;
  rmSync(dir, { recursive: true, force: true });
});

describe("the CLI and the request counter", () => {
  it("does not count a report built from the command line", () => {
    db().$client.prepare("DELETE FROM requests").run();
    const report = run(["AAPL", "buy call"]);
    expect(report.status).toBe(0);
    expect(report.stdout).toContain("CHECK 1");
    // The counter measures web traffic; asking from a terminal is not that.
    expect(total()).toBe(0);
  });

  it("reports an empty counter plainly rather than as an error", () => {
    db().$client.prepare("DELETE FROM requests").run();
    const stats = run(["--stats"]);
    expect(stats.status).toBe(0);
    expect(stats.stdout).toContain("Reports built: 0");
    expect(stats.stdout).toContain("No reports have been recorded");
  });

  it("prints the counts, grouped, without changing them", () => {
    db().$client.prepare("DELETE FROM requests").run();
    recordRequest({ symbol: "AAPL", action: "buy call", mode: "sample" });
    recordRequest({ symbol: "AAPL", action: "buy call", mode: "sample" });
    recordRequest({ symbol: "SPY", action: "buy shares", mode: "live" });

    const stats = run(["--stats"]);
    expect(stats.status).toBe(0);
    expect(stats.stdout).toContain("Reports built: 3");
    expect(stats.stdout).toMatch(/By data mode[\s\S]*sample\s+2/);
    expect(stats.stdout).toMatch(/By data mode[\s\S]*live\s+1/);
    expect(stats.stdout).toMatch(/By ticker[\s\S]*AAPL\s+2/);
    expect(stats.stdout).toMatch(/By action[\s\S]*buy call\s+2/);

    // Reading is not writing.
    expect(total()).toBe(3);
  });

  it("names --stats in the help text", () => {
    const help = run(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--stats");
  });
});
