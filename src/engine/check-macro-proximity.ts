import {
  MACRO_EVENTS,
  MACRO_RELEASE_TIMES,
  MACRO_SOURCE_URLS,
  type MacroEvent,
} from "@/data/macro";
import { figure, formatCount, pluralize } from "./formatting";
import { tradingDaysUntil } from "./trading-calendar";
import type { CheckResult } from "./types";

/**
 * Check 6 — scheduled macro releases close enough to land inside a position.
 * The calendar is embedded and used verbatim; it is never fetched at runtime
 * (CLAUDE.md §2.6).
 */

/** "Within 3 trading days" per the specification. */
export const PROXIMITY_TRADING_DAYS = 3;

export interface DatedMacroEvent extends MacroEvent {
  tradingDaysAhead: number;
}

/** Upcoming events, nearest first. Events on or before `today` are dropped. */
export function upcomingMacroEvents(today: string): DatedMacroEvent[] {
  const out: DatedMacroEvent[] = [];
  for (const event of MACRO_EVENTS) {
    const ahead = tradingDaysUntil(today, event.date);
    if (ahead === null) continue;
    out.push({ ...event, tradingDaysAhead: ahead });
  }
  return out.sort((a, b) => a.tradingDaysAhead - b.tradingDaysAhead);
}

export function macroEventsWithinWindow(today: string): DatedMacroEvent[] {
  return upcomingMacroEvents(today).filter(
    (e) => e.tradingDaysAhead <= PROXIMITY_TRADING_DAYS,
  );
}

function describe(event: DatedMacroEvent): string {
  return (
    `${event.name} — ${event.date}, ${MACRO_RELEASE_TIMES[event.type]}, ` +
    `${formatCount(event.tradingDaysAhead)} trading ` +
    `${pluralize(event.tradingDaysAhead, "day", "days")} ahead`
  );
}

export function checkMacroProximity(today: string): CheckResult {
  const upcoming = upcomingMacroEvents(today);
  const within = upcoming.filter(
    (e) => e.tradingDaysAhead <= PROXIMITY_TRADING_DAYS,
  );
  const figures = [];
  let summary: string;

  figures.push(
    figure(
      `Scheduled events within ${PROXIMITY_TRADING_DAYS} trading days`,
      formatCount(within.length),
      within.length,
    ),
  );

  if (within.length > 0) {
    for (const event of within) {
      figures.push(figure(event.name, describe(event), event.tradingDaysAhead));
    }
    summary =
      `${formatCount(within.length)} scheduled macro ` +
      `${pluralize(within.length, "release lands", "releases land")} within ` +
      `${PROXIMITY_TRADING_DAYS} trading days: ` +
      `${within.map((e) => `${e.name} on ${e.date}`).join("; ")}.`;
  } else if (upcoming.length > 0) {
    const next = upcoming[0];
    figures.push(figure("Next scheduled event", describe(next), next.tradingDaysAhead));
    summary =
      `No FOMC, CPI, or jobs release falls within ${PROXIMITY_TRADING_DAYS} ` +
      `trading days. The next one is ${next.name} on ${next.date}, ` +
      `${formatCount(next.tradingDaysAhead)} trading ` +
      `${pluralize(next.tradingDaysAhead, "day", "days")} ahead.`;
  } else {
    // The embedded calendar has a fixed horizon; past its end there is nothing
    // to report, and the report says so rather than implying an all-clear.
    const last = MACRO_EVENTS[MACRO_EVENTS.length - 1];
    figures.push(
      figure("Next scheduled event", `None — the embedded calendar ends ${last.date}`),
    );
    summary =
      `The embedded macro calendar ends on ${last.date} and lists no event ` +
      `after ${today}.`;
  }

  return {
    number: 6,
    title: "Macro-event proximity",
    summary,
    figures,
    notes: [
      "Release times are 8:30 a.m. ET for BLS releases and 2:00 p.m. ET for " +
        "the FOMC decision. Trading days exclude weekends and NYSE holidays.",
      "This calendar is embedded in the app and is never fetched at run time.",
    ],
    citation:
      `Sources: FOMC ${MACRO_SOURCE_URLS.fomc}; CPI ${MACRO_SOURCE_URLS.cpi}; ` +
      `jobs ${MACRO_SOURCE_URLS.jobs}.`,
  };
}
