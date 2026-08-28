import { describe, expect, it } from "vitest";
import {
  addIsoDays,
  isIsoDate,
  isoDayOfWeek,
  isoDaysBetween,
  parseIsoDate,
  toIsoDate,
  toUtcIsoDate,
} from "@/engine/calendar";

describe("calendar", () => {
  it("reads a market-hours instant as its Eastern trading date", () => {
    // 13:30Z is 09:30 in New York during daylight time.
    expect(toIsoDate(new Date("2024-07-01T13:30:00Z"))).toBe("2024-07-01");
    expect(toIsoDate(new Date("2024-01-02T14:30:00Z"))).toBe("2024-01-02");
  });

  it("keeps a UTC-midnight date-only value on its own day", () => {
    // Reading this in New York would move it back to 2026-08-30.
    expect(toUtcIsoDate(new Date("2026-08-31T00:00:00Z"))).toBe("2026-08-31");
    expect(toIsoDate(new Date("2026-08-31T00:00:00Z"))).toBe("2026-08-30");
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-08-28")).toBe(true);
    expect(isIsoDate("2026-8-28")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("not a date")).toBe(false);
  });

  it("rejects a malformed date instead of guessing", () => {
    expect(() => parseIsoDate("2026-13-01")).toThrow();
  });

  it("adds days across a month and a year boundary", () => {
    expect(addIsoDays("2026-08-28", 4)).toBe("2026-09-01");
    expect(addIsoDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addIsoDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days in both directions", () => {
    expect(isoDaysBetween("2026-08-28", "2026-10-29")).toBe(62);
    expect(isoDaysBetween("2026-10-29", "2026-08-28")).toBe(-62);
    expect(isoDaysBetween("2026-08-28", "2026-08-28")).toBe(0);
  });

  it("is unaffected by daylight saving transitions", () => {
    // 2026-11-01 is the US DST fall-back; a naive local-time subtraction
    // would return 0 or a fraction here.
    expect(isoDaysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(isoDaysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("reports the day of week", () => {
    expect(isoDayOfWeek("2026-08-28")).toBe(5); // Friday
    expect(isoDayOfWeek("2026-08-30")).toBe(0); // Sunday
  });
});
