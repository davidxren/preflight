import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport } from "@/engine/report";
import { TRADE_ACTIONS } from "@/engine/types";
import { fixture } from "./support/snapshots";

/**
 * CLAUDE.md §7. "win rate" is permitted only as the labelled input field in the
 * check-4 sizing calculator, so those files are listed explicitly rather than
 * the phrase being waved through everywhere.
 */
const BANNED: { phrase: string; pattern: RegExp; allowedIn: string[] }[] = [
  { phrase: "beat the market", pattern: /beat the market/i, allowedIn: [] },
  { phrase: "edge", pattern: /\bedge\b/i, allowedIn: [] },
  {
    phrase: "win rate",
    pattern: /win[ -]rate/i,
    allowedIn: [
      "src/engine/risk-of-ruin.ts",
      "src/engine/check-risk-of-ruin.ts",
      "src/app/sizing-fields.tsx",
    ],
  },
  { phrase: "AI-powered predictions", pattern: /ai[ -]powered predictions/i, allowedIn: [] },
  { phrase: "stop losing money", pattern: /stop losing money/i, allowedIn: [] },
];

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".md"]);
const ROOT = new URL("..", import.meta.url).pathname;

/** Every source and copy file the app ships, excluding captured price data. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (SCANNED_EXTENSIONS.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * CLAUDE.md and this test are excluded on purpose: both quote the banned
 * phrases in order to state and enforce the rule. Fixture JSON is excluded
 * because it is captured price data, not copy.
 */
const FILES = [
  ...sourceFiles(join(ROOT, "src")),
  ...sourceFiles(join(ROOT, "scripts")),
  join(ROOT, "README.md"),
];

describe("banned phrases", () => {
  it("scans a non-trivial set of files", () => {
    expect(FILES.length).toBeGreaterThan(15);
  });

  for (const { phrase, pattern, allowedIn } of BANNED) {
    it(`does not use "${phrase}" outside its allowed files`, () => {
      const offenders: string[] = [];
      for (const file of FILES) {
        const rel = relative(ROOT, file);
        if (allowedIn.includes(rel)) continue;
        if (pattern.test(readFileSync(file, "utf8"))) offenders.push(rel);
      }
      expect(offenders).toEqual([]);
    });
  }

  it('keeps "win rate" out of every rendered report', () => {
    for (const symbol of ["AAPL", "SPY"]) {
      for (const action of TRADE_ACTIONS) {
        const report = buildReport({
          snapshot: fixture(symbol),
          action,
          today: "2026-08-28",
        });
        // Check 4 is the sizing calculator and is the one permitted use.
        const others = report.checks.filter((c) => c.number !== 4);
        expect(JSON.stringify(others)).not.toMatch(/win[ -]rate/i);
        for (const { pattern, phrase } of BANNED) {
          if (phrase === "win rate") continue;
          expect(JSON.stringify(report)).not.toMatch(pattern);
        }
      }
    }
  });
});
