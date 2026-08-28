import { addIsoDays, isoDayOfWeek, parseIsoDate } from "./calendar";

/**
 * NYSE trading days, derived from the exchange's published holiday rules
 * rather than a hand-copied date list, so the calendar cannot go stale.
 * Rules: https://www.nyse.com/markets/hours-calendars
 *
 * Not modelled: ad-hoc closures (national days of mourning, weather) and
 * half-day early closes, which do not change whether a day is a trading day.
 */

/** Gregorian computus (Meeus/Jones/Butcher). Returns Easter Sunday. */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function pad(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The `nth` (1-based) `weekday` of a month, e.g. the 3rd Monday of January. */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): string {
  const firstDow = parseIsoDate(pad(year, month, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDow + 7) % 7) + (nth - 1) * 7;
  return pad(year, month, day);
}

function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = parseIsoDate(pad(year, month, lastDay)).getUTCDay();
  return pad(year, month, lastDay - ((lastDow - weekday + 7) % 7));
}

/** Saturday holidays are observed the Friday before, Sundays the Monday after. */
function observed(date: string): string {
  const dow = isoDayOfWeek(date);
  if (dow === 6) return addIsoDays(date, -1);
  if (dow === 0) return addIsoDays(date, 1);
  return date;
}

/** The full set of NYSE holiday closures for a calendar year. */
export function nyseHolidays(year: number): string[] {
  const goodFriday = addIsoDays(easterSunday(year), -2);
  const fixed = [
    pad(year, 1, 1), // New Year's Day
    pad(year, 6, 19), // Juneteenth National Independence Day
    pad(year, 7, 4), // Independence Day
    pad(year, 12, 25), // Christmas Day
  ].map(observed);
  return [
    ...fixed,
    nthWeekdayOfMonth(year, 1, 1, 3), // Martin Luther King, Jr. Day
    nthWeekdayOfMonth(year, 2, 1, 3), // Washington's Birthday
    goodFriday,
    lastWeekdayOfMonth(year, 5, 1), // Memorial Day
    nthWeekdayOfMonth(year, 9, 1, 1), // Labor Day
    nthWeekdayOfMonth(year, 11, 4, 4), // Thanksgiving Day
  ].sort();
}

const holidayCache = new Map<number, Set<string>>();

function holidaySet(year: number): Set<string> {
  let cached = holidayCache.get(year);
  if (!cached) {
    cached = new Set(nyseHolidays(year));
    holidayCache.set(year, cached);
  }
  return cached;
}

export function isTradingDay(date: string): boolean {
  const dow = isoDayOfWeek(date);
  if (dow === 0 || dow === 6) return false;
  return !holidaySet(Number(date.slice(0, 4))).has(date);
}

export function nextTradingDay(date: string): string {
  let cursor = addIsoDays(date, 1);
  while (!isTradingDay(cursor)) cursor = addIsoDays(cursor, 1);
  return cursor;
}

/**
 * Trading sessions strictly after `from` up to and including `target`.
 * 1 means "the next session". Returns null when `target` is not after `from`,
 * because "days until" is meaningless for a date that has already passed.
 */
export function tradingDaysUntil(from: string, target: string): number | null {
  if (parseIsoDate(target).getTime() <= parseIsoDate(from).getTime()) {
    return null;
  }
  let count = 0;
  let cursor = from;
  while (cursor !== target) {
    cursor = addIsoDays(cursor, 1);
    if (isTradingDay(cursor)) count += 1;
  }
  return count;
}
