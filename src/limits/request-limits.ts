import { headers } from "next/headers";
import { TokenBucket } from "./token-bucket";

/**
 * The bounds that keep a server action from being a free amplifier (v1.1 D8).
 * Every over-limit response says what the limit is, in a sentence, and returns
 * no report and no number.
 */

/** Owner defaults. */
export const LIVE_REPORTS_PER_MINUTE = 10;
export const MAX_UNSETTLED_PREDICTIONS = 20;

const ONE_MINUTE_MS = 60_000;

/**
 * Only live mode is limited. A sample report reaches no upstream source and
 * costs a bounded amount of local work, so rate-limiting it would turn a
 * shared address behind a proxy into a broken app for no benefit.
 */
const liveReports = new TokenBucket({
  capacity: LIVE_REPORTS_PER_MINUTE,
  windowMs: ONE_MINUTE_MS,
});

/**
 * The caller's address, from the proxy headers Fly sets. Unknown collapses to
 * one shared bucket, which limits an unidentifiable caller rather than
 * exempting them. The value is used for counting only: it is never stored,
 * logged, or written to any table (CLAUDE.md §2.3).
 */
export async function callerAddress(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headerList.get("fly-client-ip")?.trim() || "unknown";
}

export interface LimitDecision {
  allowed: boolean;
  /** Sentence-case message describing the limit, when it was reached. */
  message?: string;
}

/** Sentence-case, states the limit, and promises nothing about the future. */
export function rateLimitMessage(perMinute: number): string {
  return (
    `Live data is limited to ${perMinute} reports a minute from one address. ` +
    "Wait a moment and run the checks again, or use sample mode."
  );
}

export function unsettledLimitMessage(limit: number): string {
  return (
    `You already have ${limit} forecasts waiting to settle, which is the most ` +
    "this practice mode keeps at once. One of them has to settle before you " +
    "can record another."
  );
}

/**
 * Spends one live-report token for `caller`. `now` is injectable so the refill
 * is testable without waiting a real minute.
 */
export function takeLiveReport(caller: string, now?: number): LimitDecision {
  const decision = liveReports.take(caller, now);
  if (decision.allowed) return { allowed: true };
  return { allowed: false, message: rateLimitMessage(LIVE_REPORTS_PER_MINUTE) };
}

/** True once a visitor is holding the most unsettled forecasts allowed. */
export function atUnsettledLimit(unsettled: number): boolean {
  return unsettled >= MAX_UNSETTLED_PREDICTIONS;
}
