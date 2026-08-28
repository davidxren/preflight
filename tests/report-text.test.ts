import { describe, expect, it } from "vitest";
import { buildReport } from "@/engine/report";
import { renderReportText } from "@/engine/report-text";
import { fixture } from "./support/snapshots";

const TEXT = renderReportText(
  buildReport({ snapshot: fixture("AAPL"), action: "buy call", today: "2026-08-28" }),
);

describe("plain-text report", () => {
  it("prints all six checks", () => {
    for (let n = 1; n <= 6; n += 1) {
      expect(TEXT).toContain(`CHECK ${n} —`);
    }
  });

  it("prints the disclaimer verbatim, unwrapped", () => {
    const disclaimerBlock = TEXT.split("DISCLAIMER")[1] ?? "";
    const collapsed = disclaimerBlock.replace(/[-\s]+/g, " ").trim();
    expect(collapsed).toContain(
      "Preflight is an educational tool. It shows publicly documented " +
        "statistics about market situations.",
    );
    expect(collapsed).toContain("Trading involves substantial risk of loss.");
  });

  it("names the data source so sample output is never mistaken for live", () => {
    expect(TEXT).toContain("Data source .... sample");
  });

  it("keeps every line within the terminal width", () => {
    for (const line of TEXT.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it("prints a reason under every Data unavailable figure", () => {
    const lines = TEXT.split("\n");
    lines.forEach((line, i) => {
      if (line.includes("Data unavailable")) {
        expect(lines.slice(i + 1, i + 3).join(" ")).toContain("Reason:");
      }
    });
  });
});
