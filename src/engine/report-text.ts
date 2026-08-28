import { DATA_UNAVAILABLE } from "./disclaimer";
import type { CheckResult, Report } from "./types";

/**
 * Plain-text rendering of a report, used by the CLI. Kept beside the engine so
 * the terminal and the web page show the same figures in the same order, and
 * so the disclaimer is emitted from the same protected constant.
 */

const WIDTH = 78;
const LABEL_WIDTH = 46;

/** Greedy wrap that never splits a word, for terminal-width prose. */
function wrap(text: string, width: number, indent: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length + indent.length > width) {
      if (current) lines.push(indent + current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(indent + current);
  return lines;
}

/** Dot leaders line up figures down the page, as on a printed checklist. */
function leaderLine(label: string, value: string): string {
  const trimmed =
    label.length > LABEL_WIDTH ? `${label.slice(0, LABEL_WIDTH - 1)}…` : label;
  const dots = ".".repeat(Math.max(2, LABEL_WIDTH - trimmed.length + 1));
  return `  ${trimmed} ${dots} ${value}`;
}

function renderCheck(check: CheckResult): string[] {
  const lines: string[] = [];
  lines.push("");
  lines.push(`CHECK ${check.number} — ${check.title}`);
  lines.push("-".repeat(WIDTH));
  lines.push(...wrap(check.summary, WIDTH, "  "));
  lines.push("");
  for (const f of check.figures) {
    // A long value would break the leader alignment, so it wraps underneath.
    if (f.value.length > WIDTH - LABEL_WIDTH - 6) {
      lines.push(`  ${f.label}:`);
      lines.push(...wrap(f.value, WIDTH, "    "));
    } else {
      lines.push(leaderLine(f.label, f.value));
    }
    if (f.value === DATA_UNAVAILABLE && f.reason) {
      lines.push(...wrap(`Reason: ${f.reason}`, WIDTH, "    "));
    }
  }
  for (const note of check.notes) {
    lines.push("");
    lines.push(...wrap(`Note: ${note}`, WIDTH, "  "));
  }
  if (check.citation) {
    lines.push("");
    lines.push(...wrap(`Cited: ${check.citation}`, WIDTH, "  "));
  }
  return lines;
}

export function renderReportText(report: Report): string {
  const lines: string[] = [];
  lines.push("=".repeat(WIDTH));
  lines.push(`PREFLIGHT — ${report.symbol} — ${report.action}`);
  lines.push("=".repeat(WIDTH));
  // Wrapped like every other line: a live provenance string can be long.
  lines.push(...wrap(`Report date .... ${report.today}`, WIDTH, ""));
  lines.push(
    ...wrap(`Market data .... as of ${report.asOf ?? DATA_UNAVAILABLE}`, WIDTH, ""),
  );
  lines.push(
    ...wrap(`Data source .... ${report.source} — ${report.provenance}`, WIDTH, ""),
  );

  for (const check of report.checks) lines.push(...renderCheck(check));

  lines.push("");
  lines.push("=".repeat(WIDTH));
  lines.push("PLAIN-LANGUAGE SUMMARY");
  lines.push(`(${report.explanation.origin})`);
  lines.push("-".repeat(WIDTH));
  for (const paragraph of report.explanation.text.split("\n")) {
    lines.push(...wrap(paragraph, WIDTH, ""));
  }

  lines.push("");
  lines.push("=".repeat(WIDTH));
  lines.push("DISCLAIMER");
  lines.push("-".repeat(WIDTH));
  lines.push(...wrap(report.disclaimer, WIDTH, ""));
  lines.push("");
  return lines.join("\n");
}
