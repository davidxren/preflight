import { describe, expect, it } from "vitest";
import { buildReport } from "@/engine/report";
import { TRADE_ACTIONS } from "@/engine/types";
import { fixture } from "./support/snapshots";

/**
 * CLAUDE.md §2.2 — the report states situations and never renders a verdict,
 * score, grade, rating, or recommendation. This walks the rendered report
 * rather than the source, so prose assembled at runtime is covered too.
 */
const VERDICT_LANGUAGE: RegExp[] = [
  /\byou should\b/i,
  /\bwe recommend\b/i,
  /\brecommendation\b/i,
  /\b(buy|sell|avoid|don't buy) (this|it)\b/i,
  /\bgood (trade|entry|setup)\b/i,
  /\bbad (trade|entry|setup)\b/i,
  /\boverall score\b/i,
  /\bpreflight score\b/i,
  /\brating\b/i,
  /\bgrade\b/i,
  /\bverdict\b/i,
  /\bbullish signal\b/i,
  /\bbearish signal\b/i,
  /\bsafe to\b/i,
  /\brisky bet\b/i,
];

describe("no verdicts, scores, grades, or recommendations", () => {
  it("renders none of them for any ticker and action", () => {
    for (const symbol of ["AAPL", "NVDA", "TSLA", "SPY"]) {
      for (const action of TRADE_ACTIONS) {
        const report = buildReport({
          snapshot: fixture(symbol),
          action,
          today: "2026-08-28",
        });
        const rendered = JSON.stringify(report);
        for (const pattern of VERDICT_LANGUAGE) {
          expect(
            pattern.test(rendered),
            `${symbol} / ${action} matched ${pattern}`,
          ).toBe(false);
        }
      }
    }
  });

  it("gives no check an overall numeric score field", () => {
    const report = buildReport({
      snapshot: fixture("AAPL"),
      action: "buy call",
      today: "2026-08-28",
    });
    for (const check of report.checks) {
      expect(Object.keys(check)).toEqual([
        "number",
        "title",
        "summary",
        "figures",
        "notes",
        "citation",
      ]);
    }
  });
});
