import { DATA_UNAVAILABLE } from "./disclaimer";
import type { Figure } from "./types";

/**
 * Display helpers. Every figure the report shows goes through here so a
 * missing value can only ever render as the exact `Data unavailable` string
 * (CLAUDE.md §2.1), never as 0, "-", or NaN.
 */

export function figure(label: string, value: string, numeric?: number): Figure {
  return numeric === undefined ? { label, value } : { label, value, numeric };
}

export function unavailable(label: string, reason: string): Figure {
  return { label, value: DATA_UNAVAILABLE, reason };
}

/** True when a value is usable as a number in a report figure. */
export function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** `value` is already expressed in percentage points. */
export function formatPercent(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/** Same, but always carries an explicit sign so direction reads at a glance. */
export function formatSignedPercent(value: number, decimals: number = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Plain decimal, for ratios and fractions. */
export function formatDecimal(value: number, decimals: number = 4): string {
  return value.toFixed(decimals);
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
