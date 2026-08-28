/**
 * Embedded macro calendar (CLAUDE.md §6/§13). These dates are used verbatim and
 * are never fetched at runtime. All times are 8:30 a.m. ET (BLS releases) or
 * 2:00 p.m. ET (FOMC decision).
 */

export type MacroEventType = "fomc" | "cpi" | "jobs";

export interface MacroEvent {
  date: string;
  name: string;
  type: MacroEventType;
}

export const MACRO_SOURCE_URLS: Readonly<Record<MacroEventType, string>> = {
  fomc: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  cpi: "https://www.bls.gov/schedule/news_release/cpi.htm",
  jobs: "https://www.bls.gov/schedule/news_release/empsit.htm",
};

export const MACRO_EVENTS: readonly MacroEvent[] = [
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
  {
    date: "2027-01-27",
    name: "FOMC decision (Jan, tentative)",
    type: "fomc",
  },
] as const;

/** Release time of day, by event type, as shown on the report. */
export const MACRO_RELEASE_TIMES: Readonly<Record<MacroEventType, string>> = {
  jobs: "8:30 a.m. ET",
  cpi: "8:30 a.m. ET",
  fomc: "2:00 p.m. ET",
};
