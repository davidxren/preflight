import { describe, expect, it } from "vitest";
import { buildReport } from "@/engine/report";
import type { Report } from "@/engine/types";
import {
  EXPLAINER_MAX_TOKENS,
  EXPLAINER_MODEL,
  EXPLAINER_SYSTEM,
  explainerPayload,
  hasApiKey,
} from "@/explainer/anthropic-explainer";
import { explainReport, type ExplainerDependencies } from "@/explainer/explain-report";
import {
  allowedNumbers,
  normalizeNumber,
  unsupportedNumbers,
} from "@/explainer/number-guard";
import { fixture } from "./support/snapshots";

const REPORT: Report = buildReport({
  snapshot: fixture("AAPL"),
  action: "buy call",
  today: "2026-08-28",
});

function deps(
  overrides: Partial<ExplainerDependencies> = {},
): ExplainerDependencies {
  return {
    keyPresent: () => true,
    request: async () => ({ ok: true, value: "" }),
    ...overrides,
  };
}

describe("number normalisation", () => {
  it("treats thousands separators as formatting", () => {
    expect(normalizeNumber("2,514")).toBe("2514");
    expect(normalizeNumber("10,000.00")).toBe("10000");
  });

  it("treats trailing zeros as formatting", () => {
    expect(normalizeNumber("1.10")).toBe("1.1");
    expect(normalizeNumber("2.00")).toBe("2");
    expect(normalizeNumber("0.00")).toBe("0");
  });

  it("keeps a leading zero before a decimal point", () => {
    expect(normalizeNumber("0.46")).toBe("0.46");
  });

  it("does not collapse two genuinely different numbers", () => {
    expect(normalizeNumber("1.11")).not.toBe(normalizeNumber("1.1"));
    expect(normalizeNumber("62")).not.toBe(normalizeNumber("6.2"));
  });
});

describe("number guard", () => {
  const allowed = allowedNumbers(REPORT);

  it("accepts prose that reuses the engine's own figures", () => {
    expect(unsupportedNumbers("Next earnings is 2026-10-29, 62 days away.", allowed))
      .toEqual([]);
  });

  it("accepts prose with no numbers at all", () => {
    expect(unsupportedNumbers("The nearest expiry prices a small move.", allowed))
      .toEqual([]);
  });

  it("catches a number the engine never produced", () => {
    expect(unsupportedNumbers("The implied move is 47.3%.", allowed)).toContain("47.3");
  });

  it("catches an invented figure sitting among real ones", () => {
    const offenders = unsupportedNumbers(
      "Next earnings is 2026-10-29, which is 62 days away, and the stock will rise 12.7%.",
      allowed,
    );
    expect(offenders).toEqual(["12.7"]);
  });
});

describe("gate G2", () => {
  it("keeps the deterministic template when no key is present", async () => {
    const result = await explainReport(REPORT, deps({ keyPresent: () => false }));
    expect(result.explanation.origin).toBe("template");
    expect(result.explanation.text).toBe(REPORT.explanation.text);
    expect(result.explanation.fallbackReason).toBeUndefined();
  });

  it("reads the key from the environment", () => {
    expect(hasApiKey({})).toBe(false);
    expect(hasApiKey({ ANTHROPIC_API_KEY: "   " })).toBe(false);
    expect(hasApiKey({ ANTHROPIC_API_KEY: "sk-test" })).toBe(true);
  });
});

describe("explainReport", () => {
  it("uses the model's prose when it introduces no new number", async () => {
    const prose = "Next earnings is 2026-10-29, 62 days away. Nothing else is due.";
    const result = await explainReport(
      REPORT,
      deps({ request: async () => ({ ok: true, value: prose }) }),
    );
    expect(result.explanation.origin).toBe("model");
    expect(result.explanation.text).toBe(prose);
  });

  it("discards the model's prose when it injects a number", async () => {
    const injected =
      "Next earnings is 2026-10-29. The implied move is 47.3% and the stock should double.";
    const result = await explainReport(
      REPORT,
      deps({ request: async () => ({ ok: true, value: injected }) }),
    );
    expect(result.explanation.origin).toBe("template");
    expect(result.explanation.text).toBe(REPORT.explanation.text);
    expect(result.explanation.text).not.toContain("47.3");
    expect(result.explanation.fallbackReason).toContain("47.3");
  });

  it("falls back to the template when the request fails", async () => {
    const result = await explainReport(
      REPORT,
      deps({ request: async () => ({ ok: false, reason: "rate limited" }) }),
    );
    expect(result.explanation.origin).toBe("template");
    expect(result.explanation.fallbackReason).toContain("rate limited");
  });

  it("leaves the checks and the disclaimer untouched either way", async () => {
    const result = await explainReport(
      REPORT,
      deps({ request: async () => ({ ok: true, value: "All quiet." }) }),
    );
    expect(result.checks).toEqual(REPORT.checks);
    expect(result.disclaimer).toBe(REPORT.disclaimer);
  });
});

describe("explainer request shape", () => {
  it("uses the specified model and token ceiling", () => {
    expect(EXPLAINER_MODEL).toBe("claude-haiku-4-5");
    expect(EXPLAINER_MAX_TOKENS).toBe(400);
  });

  it("forbids inventing numbers and giving verdicts in the system prompt", () => {
    expect(EXPLAINER_SYSTEM).toMatch(/never write a number/i);
    expect(EXPLAINER_SYSTEM).toMatch(/verdict, score, grade, rating, recommendation/i);
    expect(EXPLAINER_SYSTEM).toMatch(/make no prediction/i);
  });

  it("sends only figures the engine computed", () => {
    const payload = explainerPayload(REPORT);
    const allowed = allowedNumbers(REPORT);
    // Anything the model could copy from the payload is already an engine number.
    expect(unsupportedNumbers(payload, allowed)).toEqual([]);
  });
});
