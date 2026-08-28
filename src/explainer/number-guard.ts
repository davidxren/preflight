import { engineNumberTokens } from "@/engine/explainer-template";
import type { Report } from "@/engine/types";

/**
 * The guard behind hard rule 4 (CLAUDE.md §2.4): the explainer may rephrase,
 * but every number it prints must already exist in the engine's payload. Any
 * digit the engine did not produce means the whole model output is discarded.
 */

const NUMBER = /\d+(?:[.,]\d+)*/g;

/**
 * Reduces a numeric token to the value it denotes, so a difference in
 * formatting is not mistaken for a different number: "2,514" and "2514" are
 * the same figure, and so are "1.10" and "1.1". This only ever collapses
 * renderings of one value; it never lets a new value through.
 */
export function normalizeNumber(token: string): string {
  let value = token.replace(/,/g, "");
  if (value.includes(".")) {
    value = value.replace(/0+$/, "").replace(/\.$/, "");
  }
  return value.replace(/^0+(?=\d)/, "");
}

/** Every number the engine put in the report, normalized. */
export function allowedNumbers(report: Report): Set<string> {
  const allowed = new Set<string>();
  for (const token of engineNumberTokens(report)) {
    allowed.add(normalizeNumber(token));
  }
  return allowed;
}

/** Numbers in `text` that the engine never produced. Empty means the text passes. */
export function unsupportedNumbers(
  text: string,
  allowed: ReadonlySet<string>,
): string[] {
  const offenders: string[] = [];
  for (const match of text.matchAll(NUMBER)) {
    if (!allowed.has(normalizeNumber(match[0]))) offenders.push(match[0]);
  }
  return offenders;
}
