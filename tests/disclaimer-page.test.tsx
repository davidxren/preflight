// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";
import Methodology from "@/app/methodology/page";
import { LEGAL_DISCLAIMER } from "@/engine/disclaimer";

/**
 * CLAUDE.md §6: the legal copy is verbatim and protected, and must appear on
 * every report. The engine and the CLI already assert it; this asserts the
 * rendered page (owner amendment 4).
 *
 * The comparison is against the text in CLAUDE.md itself, not against
 * LEGAL_DISCLAIMER. Comparing the page to the constant would pass even if both
 * were edited together, which is exactly the change §6 forbids.
 */

// process.cwd() rather than import.meta.url: under the DOM environment the
// module url is rewritten with a /@fs prefix that node:fs cannot open.
const ROOT = process.cwd();

/** The blockquote under the §6 heading, unwrapped to a single line. */
function protectedDisclaimer(): string {
  const claudeMd = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  const heading = "## Legal disclaimer (§6)";
  const start = claudeMd.indexOf(heading);
  if (start === -1) throw new Error("CLAUDE.md has no §6 legal disclaimer heading");

  const lines = claudeMd.slice(start + heading.length).split("\n");
  const quoted: string[] = [];
  for (const line of lines) {
    if (line.startsWith("> ")) quoted.push(line.slice(2).trim());
    else if (quoted.length > 0) break;
  }
  if (quoted.length === 0) throw new Error("CLAUDE.md §6 has no blockquote");
  return quoted.join(" ").replace(/\s+/g, " ").trim();
}

/** Visible text of a rendered page, with markup and entities resolved. */
function visibleText(markup: string): string {
  document.body.innerHTML = markup;
  return (document.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("the protected disclaimer", () => {
  const expected = protectedDisclaimer();

  it("is what CLAUDE.md §6 actually says", () => {
    expect(expected).toMatch(/^Preflight is an educational tool\./);
    expect(expected).toMatch(/Trading involves substantial risk of loss\.$/);
  });

  it("appears on the report page byte-identical, wherever the layout puts it", () => {
    const text = visibleText(renderToStaticMarkup(<Home />));
    expect(text).toContain(expected);
  });

  it("appears on the methodology page too", () => {
    const text = visibleText(renderToStaticMarkup(<Methodology />));
    expect(text).toContain(expected);
  });

  it("is the same string the engine and the CLI emit", () => {
    // One copy in the codebase, and that copy matches the contract.
    expect(LEGAL_DISCLAIMER).toBe(expected);
  });

  it("is not shortened or split across the page", () => {
    const text = visibleText(renderToStaticMarkup(<Home />));
    const occurrences = text.split(expected).length - 1;
    expect(occurrences).toBe(1);
  });
});
