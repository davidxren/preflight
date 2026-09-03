/**
 * Every fetcher returns a reason on failure instead of throwing or returning a
 * placeholder value, so the report can print `Data unavailable` alongside why
 * (CLAUDE.md §2.1).
 */
export type Fetched<T> = { ok: true; value: T } | { ok: false; reason: string };

export function ok<T>(value: T): Fetched<T> {
  return { ok: true, value };
}

export function failed<T>(reason: string): Fetched<T> {
  return { ok: false, reason };
}

/** Trims a thrown value down to one line suitable for the report. */
export function reasonFrom(error: unknown, context: string): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${context}: ${detail.replace(/\s+/g, " ").slice(0, 160)}`;
}

/**
 * Yahoo's endpoints depend on a crumb/cookie that expires within minutes and
 * rate-limits; a single retry clears the common transient case without
 * turning a hard failure into a slow one (CLAUDE.md data rules).
 */
export async function withOneRetry<T>(
  attempt: () => Promise<T>,
  onRetry: (error: unknown) => void,
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    onRetry(error);
    return await attempt();
  }
}

/** Owner default for a single outbound attempt (v1.1 contract, D1). */
export const ATTEMPT_TIMEOUT_MS = 10_000;

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} exceeded its ${ms} ms timeout`);
    this.name = "TimeoutError";
  }
}

/**
 * Bounds one attempt (v1.1 hard rule 12). Libraries that take no AbortSignal —
 * yahoo-finance2 among them — can otherwise hang a request indefinitely, and
 * `withOneRetry` would double that wait. The underlying promise is abandoned
 * rather than cancelled: it cannot be cancelled through this interface, so the
 * timeout bounds what the caller waits for, not what the library is doing.
 */
export async function withTimeout<T>(
  label: string,
  attempt: () => Promise<T>,
  ms: number = ATTEMPT_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      attempt(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    // Without this the pending timer keeps the process alive for up to `ms`
    // after a fast success, which would stall the CLI on every run.
    if (timer !== undefined) clearTimeout(timer);
  }
}
