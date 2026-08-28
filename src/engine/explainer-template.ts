import type { CheckResult, Report } from "./types";

/**
 * The deterministic prose the report always has. It is assembled purely from
 * check summaries the engine computed, so it can never contain a number the
 * engine did not produce. The optional model explainer (CLAUDE.md §14) is a
 * rephrasing of this and falls back to it whenever the guard rejects the model.
 */
export function templateExplanation(
  symbol: string,
  action: string,
  checks: readonly CheckResult[],
): string {
  const lines = checks.map((c) => `${c.title}: ${c.summary}`);
  return [
    `Six situational checks for ${symbol} with the action "${action}".`,
    ...lines,
  ].join("\n");
}

/** Every numeric token the engine put in the report, for the number guard. */
export function engineNumberTokens(report: Report): Set<string> {
  const tokens = new Set<string>();
  const add = (text: string): void => {
    for (const match of text.matchAll(/\d+(?:[.,]\d+)*/g)) tokens.add(match[0]);
  };
  add(report.symbol);
  add(report.today);
  if (report.asOf) add(report.asOf);
  for (const check of report.checks) {
    add(String(check.number));
    add(check.title);
    add(check.summary);
    add(check.citation);
    for (const note of check.notes) add(note);
    for (const f of check.figures) {
      add(f.label);
      add(f.value);
      if (f.reason) add(f.reason);
      if (f.numeric !== undefined) add(String(f.numeric));
    }
  }
  return tokens;
}
