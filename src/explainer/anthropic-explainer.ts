import Anthropic from "@anthropic-ai/sdk";
import { failed, ok, reasonFrom, type Fetched } from "@/market/fetched";
import type { Report } from "@/engine/types";

/**
 * The optional model explainer (CLAUDE.md §14). It rephrases findings the
 * engine already computed; it never computes anything. Gate G2: without
 * ANTHROPIC_API_KEY this is simply not called, which is not an error.
 */

export const EXPLAINER_MODEL = "claude-haiku-4-5";
export const EXPLAINER_MAX_TOKENS = 400;

/**
 * Owner default for the explainer call (v1.1 D1). The SDK's own default is
 * minutes long, which would hold a web request open behind an optional
 * rephrasing; exceeding this falls back to the deterministic template.
 */
export const EXPLAINER_TIMEOUT_MS = 20_000;

export const EXPLAINER_SYSTEM: string = [
  "You rewrite a pre-computed market-situation checklist into plain prose for a reader who is not a professional trader.",
  "",
  "Absolute rules:",
  "1. Never write a number, percentage, date, or quantity that is not present verbatim in the payload. Do not add, round, convert, average, or infer any figure.",
  "2. Never give a verdict, score, grade, rating, recommendation, or opinion about whether the trade is a good idea. Describe the situation only.",
  "3. Never tell the reader what to do, what to avoid, or what is likely to happen next. Make no prediction.",
  "4. If a field says the data is unavailable, say it is unavailable. Do not fill the gap.",
  "5. Keep the reader's own framing: these are situational facts, not advice.",
  "",
  "Write at most six short paragraphs, one per check, in the order given. Use sentence case. No headings, no bullet points, no emoji.",
].join("\n");

/** Only engine-produced text goes to the model, so it has no other numbers to copy. */
export function explainerPayload(report: Report): string {
  const lines: string[] = [
    `Ticker: ${report.symbol}`,
    `Intended action: ${report.action}`,
    `Report date: ${report.today}`,
    "",
  ];
  for (const check of report.checks) {
    lines.push(`Check ${check.number} — ${check.title}`);
    lines.push(`Summary: ${check.summary}`);
    for (const figure of check.figures) {
      lines.push(`  ${figure.label}: ${figure.value}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

let client: Anthropic | null = null;

export function hasApiKey(
  env: Pick<NodeJS.ProcessEnv, "ANTHROPIC_API_KEY"> = process.env,
): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

export async function requestExplanation(
  report: Report,
): Promise<Fetched<string>> {
  try {
    client ??= new Anthropic();
    const response = await client.messages.create(
      {
        model: EXPLAINER_MODEL,
        max_tokens: EXPLAINER_MAX_TOKENS,
        system: EXPLAINER_SYSTEM,
        messages: [{ role: "user", content: explainerPayload(report) }],
      },
      { timeout: EXPLAINER_TIMEOUT_MS, maxRetries: 0 },
    );
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (text.length === 0) return failed("The model returned no text.");
    return ok(text);
  } catch (error) {
    return failed(reasonFrom(error, "The explainer request failed"));
  }
}
