import type { Report } from "@/engine/types";
import type { Fetched } from "@/market/fetched";
import { hasApiKey, requestExplanation } from "./anthropic-explainer";
import { allowedNumbers, unsupportedNumbers } from "./number-guard";

/**
 * Gate G2 (CLAUDE.md §17). With no key the report keeps its deterministic
 * template, which is not an error. With a key the model's rephrasing is
 * accepted only if it introduces no number the engine did not compute; on any
 * failure the template stands and the report says why.
 */

/** Injected so the guard can be tested without an API key or a network call. */
export interface ExplainerDependencies {
  keyPresent: () => boolean;
  request: (report: Report) => Promise<Fetched<string>>;
}

const LIVE: ExplainerDependencies = {
  keyPresent: () => hasApiKey(),
  request: requestExplanation,
};

/** Returns the report with its explanation replaced, or unchanged. */
export async function explainReport(
  report: Report,
  deps: ExplainerDependencies = LIVE,
): Promise<Report> {
  if (!deps.keyPresent()) return report;

  const response = await deps.request(report);
  if (!response.ok) {
    return withFallback(report, response.reason);
  }

  const offenders = unsupportedNumbers(response.value, allowedNumbers(report));
  if (offenders.length > 0) {
    return withFallback(
      report,
      `The model's wording was discarded: it contained ${offenders.length} ` +
        `number(s) the checks did not produce (${offenders.slice(0, 5).join(", ")}).`,
    );
  }

  return {
    ...report,
    explanation: { text: response.value, origin: "model" },
  };
}

function withFallback(report: Report, reason: string): Report {
  return {
    ...report,
    explanation: { ...report.explanation, fallbackReason: reason },
  };
}
