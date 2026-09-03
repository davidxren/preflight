import { describe, expect, it, vi } from "vitest";

/**
 * The explainer's outbound call is bounded like every other one (v1.1 hard
 * rule 12, D1). It is optional prose over numbers the engine already computed,
 * so exceeding the bound must fall back to the template, never hold the report.
 */

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

describe("the explainer request", () => {
  it("passes the owner's 20 s timeout and leaves retrying to the caller", async () => {
    const { EXPLAINER_TIMEOUT_MS, requestExplanation } = await import(
      "@/explainer/anthropic-explainer"
    );
    const { buildReport } = await import("@/engine/report");
    const { fixture } = await import("./support/snapshots");

    create.mockResolvedValueOnce({ content: [{ type: "text", text: "prose" }] });
    const report = buildReport({
      snapshot: fixture("AAPL"),
      action: "buy call",
      today: "2026-08-28",
    });

    await requestExplanation(report);

    expect(EXPLAINER_TIMEOUT_MS).toBe(20_000);
    const [, options] = create.mock.calls[0];
    expect(options).toEqual({ timeout: 20_000, maxRetries: 0 });
  });

  it("reports a timed-out call as a reason rather than throwing", async () => {
    const { requestExplanation } = await import("@/explainer/anthropic-explainer");
    const { buildReport } = await import("@/engine/report");
    const { fixture } = await import("./support/snapshots");

    create.mockRejectedValueOnce(new Error("Request timed out."));
    const report = buildReport({
      snapshot: fixture("AAPL"),
      action: "buy call",
      today: "2026-08-28",
    });

    const result = await requestExplanation(report);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("The explainer request failed");
      expect(result.reason).toContain("Request timed out.");
    }
  });
});
