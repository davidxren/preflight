/**
 * Calendar-date primitives. Everything in the engine keys off `YYYY-MM-DD`
 * strings rather than Date objects, because a bar's trading date is a calendar
 * fact and comparing Dates drags timezone offsets into every comparison.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats an instant as the calendar date it falls on in `timeZone`. US market
 * data is stamped in UTC, so the exchange's own zone is the default.
 */
export function toIsoDate(
  instant: Date,
  timeZone: string = "America/New_York",
): string {
  // en-CA renders ISO-ordered dates, which sidesteps hand-assembling parts.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * Reads an instant as a UTC calendar date. Option expiries and other date-only
 * fields arrive stamped at UTC midnight, so shifting them into an exchange
 * timezone would move them to the previous day.
 */
export function toUtcIsoDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Parses `YYYY-MM-DD` as a UTC midnight instant, for offset-free arithmetic. */
export function parseIsoDate(date: string): Date {
  if (!isIsoDate(date)) throw new Error(`Not an ISO date: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

export function addIsoDays(date: string, days: number): string {
  const shifted = new Date(parseIsoDate(date).getTime() + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function isoDaysBetween(from: string, to: string): number {
  return Math.round(
    (parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000,
  );
}

/** 0 = Sunday … 6 = Saturday, in UTC so it matches `parseIsoDate`. */
export function isoDayOfWeek(date: string): number {
  return parseIsoDate(date).getUTCDay();
}
