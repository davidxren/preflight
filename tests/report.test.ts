import { describe, expect, it } from "vitest";
import { CITATIONS } from "@/engine/citations";
import { DATA_UNAVAILABLE, LEGAL_DISCLAIMER } from "@/engine/disclaimer";
import { buildReport } from "@/engine/report";
import { TRADE_ACTIONS, isTradeAction } from "@/engine/types";
import { fixture } from "./support/snapshots";

const TODAY = "2026-08-28";

describe("report", () => {
  it("assembles exactly the six checks, in order", () => {
    const report = buildReport({
      snapshot: fixture("AAPL"),
      action: "buy call",
      today: TODAY,
    });
    expect(report.checks.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("carries the legal disclaimer verbatim", () => {
    const report = buildReport({
      snapshot: fixture("TSLA"),
      action: "buy put",
      today: TODAY,
    });
    expect(report.disclaimer).toBe(
      "Preflight is an educational tool. It shows publicly documented " +
        "statistics about market situations. It does not know your finances, " +
        "does not give investment advice, and does not recommend any " +
        "transaction. Nothing here is a solicitation to buy or sell any " +
        "security. Trading involves substantial risk of loss.",
    );
    expect(report.disclaimer).toBe(LEGAL_DISCLAIMER);
  });

  it("gives every check either a figure or Data unavailable, never blank", () => {
    for (const symbol of ["AAPL", "NVDA", "TSLA", "SPY"]) {
      for (const action of TRADE_ACTIONS) {
        const report = buildReport({ snapshot: fixture(symbol), action, today: TODAY });
        for (const check of report.checks) {
          expect(check.figures.length).toBeGreaterThan(0);
          for (const f of check.figures) {
            expect(f.value.length).toBeGreaterThan(0);
            if (f.value === DATA_UNAVAILABLE) {
              expect(f.reason && f.reason.length).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it("attaches the four fixed citations to checks 1 to 4", () => {
    const report = buildReport({
      snapshot: fixture("AAPL"),
      action: "buy call",
      today: TODAY,
    });
    expect(report.checks[0].citation).toBe(CITATIONS[1]);
    expect(report.checks[1].citation).toBe(CITATIONS[2]);
    expect(report.checks[2].citation).toBe(CITATIONS[3]);
    expect(report.checks[3].citation).toBe(CITATIONS[4]);
  });

  it("quotes each citation's headline finding verbatim", () => {
    expect(CITATIONS[1]).toContain(
      "Retail losses of 5-to-9% on average, and 10-to-14% for high expected volatility announcements.",
    );
    expect(CITATIONS[2]).toContain("Weekly options average bid-ask spread of 12.6%");
    expect(CITATIONS[2]).toContain("$2.1 billion");
    expect(CITATIONS[3]).toContain(
      "Average 20-day abnormal returns are −4.7% for the top stocks purchased each day.",
    );
    expect(CITATIONS[4]).toContain(
      "97% of them lost money, only 0.4% earned more than a bank teller.",
    );
  });

  it("starts from the deterministic template explanation", () => {
    const report = buildReport({
      snapshot: fixture("AAPL"),
      action: "buy shares",
      today: TODAY,
    });
    expect(report.explanation.origin).toBe("template");
    expect(report.explanation.text).toContain("AAPL");
  });

  it("reports its data provenance so sample data is never mistaken for live", () => {
    const report = buildReport({
      snapshot: fixture("AAPL"),
      action: "buy shares",
      today: TODAY,
    });
    expect(report.source).toBe("sample");
    expect(report.provenance.length).toBeGreaterThan(0);
  });

  it("accepts only the three specified actions", () => {
    expect(TRADE_ACTIONS).toEqual(["buy shares", "buy call", "buy put"]);
    expect(isTradeAction("buy call")).toBe(true);
    expect(isTradeAction("sell call")).toBe(false);
    expect(isTradeAction("BUY CALL")).toBe(false);
  });

  it("is reproducible for the same inputs", () => {
    const a = buildReport({ snapshot: fixture("NVDA"), action: "buy put", today: TODAY });
    const b = buildReport({ snapshot: fixture("NVDA"), action: "buy put", today: TODAY });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
