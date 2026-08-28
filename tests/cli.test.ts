import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../scripts/preflight-cli";

/**
 * parseArgs is exercised directly; the end-to-end cases shell out so the
 * acceptance command in the README is the thing actually under test.
 */
function run(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", "scripts/preflight-cli.ts", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, PREFLIGHT_DATA: "sample" },
    });
    return { stdout, status: 0 };
  } catch (error) {
    const e = error as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

describe("argument parsing", () => {
  it("reads a ticker and an action", () => {
    const args = parseArgs(["aapl", "buy call"]);
    expect(args.symbol).toBe("AAPL");
    expect(args.action).toBe("buy call");
    expect(args.json).toBe(false);
    expect(args.sizing).toBeNull();
  });

  it("accepts --json and --date", () => {
    const args = parseArgs(["AAPL", "buy put", "--json", "--date=2026-08-28"]);
    expect(args.json).toBe(true);
    expect(args.today).toBe("2026-08-28");
  });

  it("builds sizing inputs from all five flags", () => {
    const args = parseArgs([
      "AAPL",
      "buy call",
      "--equity=10000",
      "--risk=0.02",
      "--win-prob=0.5",
      "--payoff=2",
      "--budget=0.5",
    ]);
    expect(args.sizing).toEqual({
      equity: 10_000,
      riskFraction: 0.02,
      winProbability: 0.5,
      payoffRatio: 2,
      riskBudgetFraction: 0.5,
    });
  });

  it("refuses a partial sizing set rather than defaulting the rest", () => {
    expect(() => parseArgs(["AAPL", "buy call", "--equity=10000"])).toThrow(
      /Missing: --risk, --win-prob, --payoff, --budget/,
    );
  });

  it("rejects an action that is not one of the three", () => {
    expect(() => parseArgs(["AAPL", "sell call"])).toThrow(/is not one of/);
  });

  it("rejects an unknown option and a non-numeric flag", () => {
    expect(() => parseArgs(["AAPL", "buy call", "--nope=1"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["AAPL", "buy call", "--equity=abc"])).toThrow(/needs a number/);
  });

  it("requires both positional arguments", () => {
    expect(() => parseArgs([])).toThrow(/ticker symbol is required/);
    expect(() => parseArgs(["AAPL"])).toThrow(/action is required/);
  });
});

describe("command line, end to end", () => {
  it("emits valid JSON with six checks", () => {
    const { stdout, status } = run(["TSLA", "buy shares", "--json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.report.checks).toHaveLength(6);
    expect(parsed.report.checks.map((c: { number: number }) => c.number)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(parsed.mode).toBe("sample");
    expect(parsed.report.disclaimer).toContain(
      "Trading involves substantial risk of loss.",
    );
  }, 60_000);

  it("keeps stdout free of anything but the JSON document", () => {
    const { stdout } = run(["AAPL", "buy call", "--json"]);
    expect(stdout.trimStart().startsWith("{")).toBe(true);
    expect(() => JSON.parse(stdout)).not.toThrow();
  }, 60_000);

  it("prints all six checks and the disclaimer as text", () => {
    const { stdout, status } = run(["AAPL", "buy call", "--date=2026-08-28"]);
    expect(status).toBe(0);
    for (let n = 1; n <= 6; n += 1) expect(stdout).toContain(`CHECK ${n} —`);
    expect(stdout).toContain("DISCLAIMER");
  }, 60_000);

  it("exits zero for --help and non-zero for a bad ticker", () => {
    expect(run(["--help"]).status).toBe(0);
    expect(run(["ZZZZ", "buy call"]).status).toBe(1);
  }, 60_000);
});
