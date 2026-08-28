import { describe, expect, it } from "vitest";
import { checkEarningsProximity } from "@/engine/check-earnings-proximity";
import { checkMacroProximity, macroEventsWithinWindow } from "@/engine/check-macro-proximity";
import {
  checkPatternBaseRates,
  patternBaseRates,
  smallSampleWarning,
} from "@/engine/check-pattern-base-rates";
import { checkRiskOfRuin } from "@/engine/check-risk-of-ruin";
import { checkSpreadDrag } from "@/engine/check-spread-drag";
import { checkTopMover } from "@/engine/check-top-mover";
import { CITATIONS } from "@/engine/citations";
import { DATA_UNAVAILABLE } from "@/engine/disclaimer";
import { emptySnapshot, fixture } from "./support/snapshots";

const TODAY = "2026-08-28";

/** True when the check reports a real figure for `label`. */
function valueOf(check: { figures: { label: string; value: string }[] }, label: string) {
  return check.figures.find((f) => f.label === label)?.value;
}

describe("check 1 — earnings proximity and implied move", () => {
  it("reports the earnings date and days out for an equity", () => {
    const check = checkEarningsProximity(fixture("AAPL"), TODAY);
    expect(check.number).toBe(1);
    expect(valueOf(check, "Next earnings date")).toBe("2026-10-29");
    expect(valueOf(check, "Days until next earnings")).toBe("62 days");
  });

  it("prices the implied move off the nearest usable expiry", () => {
    const check = checkEarningsProximity(fixture("AAPL"), TODAY);
    const move = check.figures.find((f) => f.label.startsWith("Implied move (ATM"));
    expect(move?.value).toMatch(/^\d+\.\d\d%$/);
    expect(move?.numeric).toBeGreaterThan(0);
  });

  it("states that an ETF has no earnings rather than marking it unavailable", () => {
    const check = checkEarningsProximity(fixture("SPY"), TODAY);
    expect(valueOf(check, "Next earnings date")).toContain("None scheduled");
    expect(valueOf(check, "Next earnings date")).not.toBe(DATA_UNAVAILABLE);
  });

  it("renders Data unavailable with a reason when the date is missing", () => {
    const check = checkEarningsProximity(
      emptySnapshot({ unavailable: { nextEarningsDate: "source was down" } }),
      TODAY,
    );
    const f = check.figures.find((x) => x.label === "Next earnings date");
    expect(f?.value).toBe(DATA_UNAVAILABLE);
    expect(f?.reason).toBe("source was down");
  });

  it("carries the fixed citation verbatim", () => {
    expect(checkEarningsProximity(fixture("AAPL"), TODAY).citation).toBe(CITATIONS[1]);
  });
});

describe("check 2 — options bid-ask spread drag", () => {
  it("prices the call for a call buyer and the put for a put buyer", () => {
    const call = checkSpreadDrag(fixture("AAPL"), "buy call");
    const put = checkSpreadDrag(fixture("AAPL"), "buy put");
    expect(valueOf(call, "Contract")).toMatch(/call$/);
    expect(valueOf(put, "Contract")).toMatch(/put$/);
    expect(call.figures.find((f) => f.label === "Spread as % of mid")?.numeric)
      .toBeGreaterThan(0);
  });

  it("says an option spread does not apply to buying shares", () => {
    const check = checkSpreadDrag(fixture("AAPL"), "buy shares");
    expect(valueOf(check, "At-the-money spread")).toMatch(/^Not applicable/);
    expect(valueOf(check, "At-the-money spread")).not.toBe(DATA_UNAVAILABLE);
    expect(check.notes.join(" ")).toContain("not the spread on the shares");
  });

  it("renders Data unavailable when no chain is loaded", () => {
    const check = checkSpreadDrag(
      emptySnapshot({ unavailable: { expiries: "chain was empty" } }),
      "buy call",
    );
    expect(valueOf(check, "At-the-money spread")).toBe(DATA_UNAVAILABLE);
  });

  it("carries the fixed citation verbatim", () => {
    expect(checkSpreadDrag(fixture("AAPL"), "buy call").citation).toBe(CITATIONS[2]);
  });
});

describe("check 3 — top mover and run-up", () => {
  it("reports whether the ticker is on the day-gainers screen", () => {
    const check = checkTopMover(fixture("AAPL"));
    expect(["Yes", "No"]).toContain(valueOf(check, "On today's day-gainers screen"));
  });

  it("ranks the trailing 20-session return against its own history", () => {
    const check = checkTopMover(fixture("NVDA"));
    const pct = check.figures.find((f) => f.label.includes("percentile rank"));
    expect(pct?.numeric).toBeGreaterThanOrEqual(0);
    expect(pct?.numeric).toBeLessThanOrEqual(100);
  });

  it("states the run-up condition instead of leaving it implicit", () => {
    expect(checkTopMover(fixture("AAPL")).notes.join(" ")).toContain(
      "90th percentile",
    );
  });

  it("renders Data unavailable when the screen is missing", () => {
    const check = checkTopMover(
      emptySnapshot({ unavailable: { dayGainers: "screen unreachable" } }),
    );
    expect(valueOf(check, "On today's day-gainers screen")).toBe(DATA_UNAVAILABLE);
  });
});

describe("check 4 — position sizing and risk of ruin", () => {
  it("reports Data unavailable when no numbers were entered", () => {
    const check = checkRiskOfRuin(null);
    expect(valueOf(check, "Kelly fraction")).toBe(DATA_UNAVAILABLE);
    expect(check.figures[0].reason).toContain("never stored");
  });

  it("computes the Kelly fraction and the ruin probability", () => {
    const check = checkRiskOfRuin({
      equity: 10_000,
      riskFraction: 0.02,
      winProbability: 0.5,
      payoffRatio: 2,
      riskBudgetFraction: 0.5,
    });
    expect(valueOf(check, "Kelly fraction f*")).toBe("0.2500");
    expect(valueOf(check, "Risk per trade exceeds f*")).toBe("No");
    expect(valueOf(check, "Risk of ruin over 50 trades")).toMatch(/^\d+\.\d\d%$/);
  });

  it("states the fact when risk per trade is above f*, without advising", () => {
    const check = checkRiskOfRuin({
      equity: 10_000,
      riskFraction: 0.9,
      winProbability: 0.5,
      payoffRatio: 2,
      riskBudgetFraction: 0.5,
    });
    expect(valueOf(check, "Risk per trade exceeds f*")).toBe("Yes");
  });

  it("prints the assumptions verbatim", () => {
    expect(checkRiskOfRuin(null).notes[0]).toBe(
      "Assumes independent trades, fixed fractional sizing, constant win " +
        "probability and payoff ratio, and no fees or slippage. Real results differ.",
    );
  });

  it("carries the fixed citation verbatim", () => {
    expect(checkRiskOfRuin(null).citation).toBe(CITATIONS[4]);
  });
});

describe("check 5 — pattern base rates", () => {
  it("reports all five detectors over the ten-year fixture", () => {
    const rates = patternBaseRates(fixture("AAPL").bars);
    expect(rates).toHaveLength(5);
    for (const rate of rates) {
      expect(rate.sampleSize).toBeGreaterThanOrEqual(0);
      expect(rate.horizons.map((h) => h.horizon)).toEqual([5, 20]);
    }
  });

  it("puts each pattern next to the unconditional median", () => {
    const check = checkPatternBaseRates(fixture("AAPL"));
    expect(check.figures.some((f) => f.label === "Unconditional 5-session median")).toBe(true);
    expect(check.figures.some((f) => f.label === "Unconditional 20-session median")).toBe(true);
  });

  it("uses the exact small-sample wording", () => {
    expect(smallSampleWarning(7)).toBe("Small sample — read with caution (N=7)");
  });

  it("warns only below 30 triggers", () => {
    const rates = patternBaseRates(fixture("AAPL").bars);
    for (const rate of rates) {
      expect(rate.smallSampleWarning === null).toBe(rate.sampleSize >= 30);
    }
  });

  it("renders Data unavailable when the history is too short", () => {
    const check = checkPatternBaseRates(emptySnapshot());
    expect(check.figures.every((f) => f.value === DATA_UNAVAILABLE)).toBe(true);
  });
});

describe("check 6 — macro-event proximity", () => {
  it("counts nothing inside the window five sessions before the jobs report", () => {
    const check = checkMacroProximity("2026-08-28");
    expect(valueOf(check, "Scheduled events within 3 trading days")).toBe("0");
    expect(check.summary).toContain("Employment Situation (Aug 2026)");
  });

  it("flags an event three trading days out", () => {
    // 2026-09-01 -> Sep 2, 3, 4 are the next three sessions.
    const events = macroEventsWithinWindow("2026-09-01");
    expect(events.map((e) => e.date)).toContain("2026-09-04");
  });

  it("does not flag an event four trading days out", () => {
    expect(macroEventsWithinWindow("2026-08-31").map((e) => e.date)).not.toContain(
      "2026-09-04",
    );
  });

  it("reports past the end of the embedded calendar without implying all-clear", () => {
    const check = checkMacroProximity("2030-01-01");
    expect(check.summary).toContain("embedded macro calendar ends");
  });

  it("names the published sources in its citation", () => {
    const citation = checkMacroProximity(TODAY).citation;
    expect(citation).toContain("federalreserve.gov");
    expect(citation).toContain("bls.gov/schedule/news_release/cpi.htm");
    expect(citation).toContain("bls.gov/schedule/news_release/empsit.htm");
  });
});
