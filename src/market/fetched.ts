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
