import { describe, expect, it } from "vitest";
import { MACRO_EVENTS, MACRO_SOURCE_URLS } from "@/data/macro";

/** The calendar embedded verbatim from the specification (CLAUDE.md §2.6). */
const SPECIFIED = [
  { date: "2026-09-04", name: "Employment Situation (Aug 2026)", type: "jobs" },
  { date: "2026-09-11", name: "CPI (Aug 2026)", type: "cpi" },
  { date: "2026-09-16", name: "FOMC decision (Sep)", type: "fomc" },
  { date: "2026-10-02", name: "Employment Situation (Sep 2026)", type: "jobs" },
  { date: "2026-10-14", name: "CPI (Sep 2026)", type: "cpi" },
  { date: "2026-10-28", name: "FOMC decision (Oct)", type: "fomc" },
  { date: "2026-11-06", name: "Employment Situation (Oct 2026)", type: "jobs" },
  { date: "2026-11-10", name: "CPI (Oct 2026)", type: "cpi" },
  { date: "2026-12-04", name: "Employment Situation (Nov 2026)", type: "jobs" },
  { date: "2026-12-09", name: "FOMC decision (Dec)", type: "fomc" },
  { date: "2026-12-10", name: "CPI (Nov 2026)", type: "cpi" },
  { date: "2027-01-27", name: "FOMC decision (Jan, tentative)", type: "fomc" },
];

describe("embedded macro calendar", () => {
  it("matches the specified events exactly", () => {
    expect(MACRO_EVENTS).toEqual(SPECIFIED);
  });

  it("keeps the published source urls", () => {
    expect(MACRO_SOURCE_URLS.fomc).toBe(
      "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    );
    expect(MACRO_SOURCE_URLS.cpi).toBe(
      "https://www.bls.gov/schedule/news_release/cpi.htm",
    );
    expect(MACRO_SOURCE_URLS.jobs).toBe(
      "https://www.bls.gov/schedule/news_release/empsit.htm",
    );
  });
});
