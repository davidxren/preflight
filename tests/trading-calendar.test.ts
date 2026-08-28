import { describe, expect, it } from "vitest";
import {
  isTradingDay,
  nextTradingDay,
  nyseHolidays,
  tradingDaysUntil,
} from "@/engine/trading-calendar";

/**
 * Expected values are NYSE's own published holiday calendars. The rules are
 * derived in code, so this pins them against the exchange's list.
 */
const PUBLISHED = {
  2025: [
    "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
    "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  ],
  2026: [
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  ],
  2027: [
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
    "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  ],
} as const;

describe("NYSE trading calendar", () => {
  for (const [year, expected] of Object.entries(PUBLISHED)) {
    it(`derives the published ${year} holiday closures`, () => {
      expect(nyseHolidays(Number(year))).toEqual([...expected]);
    });
  }

  it("observes a Saturday holiday on the Friday before", () => {
    // Independence Day 2026 falls on a Saturday.
    expect(nyseHolidays(2026)).toContain("2026-07-03");
    expect(nyseHolidays(2026)).not.toContain("2026-07-04");
  });

  it("observes a Sunday holiday on the Monday after", () => {
    // Independence Day 2027 falls on a Sunday.
    expect(nyseHolidays(2027)).toContain("2027-07-05");
  });

  it("excludes weekends and holidays from trading days", () => {
    expect(isTradingDay("2026-08-28")).toBe(true); // Friday
    expect(isTradingDay("2026-08-29")).toBe(false); // Saturday
    expect(isTradingDay("2026-08-30")).toBe(false); // Sunday
    expect(isTradingDay("2026-09-07")).toBe(false); // Labor Day
    expect(isTradingDay("2026-11-26")).toBe(false); // Thanksgiving
  });

  it("skips a weekend to find the next session", () => {
    expect(nextTradingDay("2026-08-28")).toBe("2026-08-31");
  });

  it("skips a holiday to find the next session", () => {
    expect(nextTradingDay("2026-09-04")).toBe("2026-09-08"); // Labor Day Monday
  });

  it("counts sessions strictly after the start date", () => {
    expect(tradingDaysUntil("2026-08-28", "2026-08-31")).toBe(1);
    expect(tradingDaysUntil("2026-08-28", "2026-09-04")).toBe(5);
  });

  it("does not count the closed days it steps over", () => {
    // Sep 7 is Labor Day, so Sep 8 is the session after Sep 4.
    expect(tradingDaysUntil("2026-09-04", "2026-09-08")).toBe(1);
  });

  it("returns null rather than a negative count for a past date", () => {
    expect(tradingDaysUntil("2026-08-28", "2026-08-27")).toBeNull();
    expect(tradingDaysUntil("2026-08-28", "2026-08-28")).toBeNull();
  });
});
