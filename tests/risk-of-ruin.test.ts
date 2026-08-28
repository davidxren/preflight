import { describe, expect, it } from "vitest";
import {
  PATH_COUNT,
  RISK_ASSUMPTIONS,
  TRADE_COUNT,
  kellyFraction,
  riskOfRuin,
  validateSizingInputs,
} from "@/engine/risk-of-ruin";
import { seededRandom } from "@/engine/seeded-random";
import type { SizingInputs } from "@/engine/types";

const BASE: SizingInputs = {
  equity: 10_000,
  riskFraction: 0.02,
  winProbability: 0.5,
  payoffRatio: 2,
  riskBudgetFraction: 0.5,
};

describe("kellyFraction", () => {
  it("computes p − (1−p)/b", () => {
    expect(kellyFraction(0.5, 2)).toBeCloseTo(0.25, 12);
    expect(kellyFraction(0.6, 1)).toBeCloseTo(0.2, 12);
  });

  it("goes negative when the payoff does not cover the loss rate", () => {
    expect(kellyFraction(0.4, 1)).toBeCloseTo(-0.2, 12);
  });

  it("returns null for a payoff ratio that is not positive", () => {
    expect(kellyFraction(0.5, 0)).toBeNull();
    expect(kellyFraction(0.5, -1)).toBeNull();
  });
});

describe("seededRandom", () => {
  it("produces the same stream for the same seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("produces a different stream for a different seed", () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });

  it("stays inside [0, 1)", () => {
    const next = seededRandom(7);
    for (let i = 0; i < 5_000; i += 1) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("riskOfRuin", () => {
  it("is reproducible across runs", () => {
    expect(riskOfRuin(BASE).probability).toBe(riskOfRuin(BASE).probability);
  });

  it("simulates the specified 10,000 paths of 50 trades by default", () => {
    const result = riskOfRuin(BASE);
    expect(result.paths).toBe(PATH_COUNT);
    expect(result.trades).toBe(TRADE_COUNT);
    expect(PATH_COUNT).toBeGreaterThanOrEqual(10_000);
    expect(TRADE_COUNT).toBe(50);
  });

  it("places the ruin threshold at the full risk budget below equity", () => {
    expect(riskOfRuin(BASE).threshold).toBe(5_000);
    expect(riskOfRuin({ ...BASE, riskBudgetFraction: 1 }).threshold).toBe(0);
  });

  it("reports a probability between 0 and 1", () => {
    const p = riskOfRuin(BASE).probability;
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it("rises as more of the account is risked per trade", () => {
    const small = riskOfRuin({ ...BASE, riskFraction: 0.01 }).probability;
    const large = riskOfRuin({ ...BASE, riskFraction: 0.5 }).probability;
    expect(large).toBeGreaterThan(small);
  });

  it("falls as the win probability rises", () => {
    const low = riskOfRuin({ ...BASE, riskFraction: 0.2, winProbability: 0.3 }).probability;
    const high = riskOfRuin({ ...BASE, riskFraction: 0.2, winProbability: 0.7 }).probability;
    expect(high).toBeLessThan(low);
  });

  it("always ruins a path that cannot win", () => {
    const certain = riskOfRuin({
      ...BASE,
      winProbability: 0,
      riskFraction: 0.5,
      riskBudgetFraction: 0.9,
    });
    expect(certain.probability).toBe(1);
  });

  it("never ruins a path that cannot lose", () => {
    expect(riskOfRuin({ ...BASE, winProbability: 1 }).probability).toBe(0);
  });

  it("states the assumptions verbatim", () => {
    expect(RISK_ASSUMPTIONS).toBe(
      "Assumes independent trades, fixed fractional sizing, constant win " +
        "probability and payoff ratio, and no fees or slippage. Real results differ.",
    );
  });
});

describe("validateSizingInputs", () => {
  it("accepts usable numbers", () => {
    expect(validateSizingInputs(BASE)).toBeNull();
  });

  it("names each unusable input", () => {
    expect(validateSizingInputs({ ...BASE, equity: 0 })).toMatch(/equity/i);
    expect(validateSizingInputs({ ...BASE, riskFraction: 0 })).toMatch(/risk per trade/i);
    expect(validateSizingInputs({ ...BASE, winProbability: 1.5 })).toMatch(/between 0 and 1/i);
    expect(validateSizingInputs({ ...BASE, payoffRatio: 0 })).toMatch(/payoff/i);
    expect(validateSizingInputs({ ...BASE, riskBudgetFraction: 0 })).toMatch(/risk budget/i);
  });
});
