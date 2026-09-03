import { eq } from "drizzle-orm";
import { db } from "./client";
import { cache } from "./schema";

/**
 * Caches successful live responses (CLAUDE.md §9/§10). The upstream source is
 * unofficial and rate-limits, so a fresh cache entry is preferred to a
 * repeated call. Only live responses land here; sample mode never touches it.
 */

/** How long a cached live response stays usable. */
export const DEFAULT_TTL_MS = 15 * 60 * 1000;

export function cacheKey(source: string, symbol: string, part: string): string {
  return `${source}:${symbol.toUpperCase()}:${part}`;
}

export function readCache<T>(
  key: string,
  ttlMs: number = DEFAULT_TTL_MS,
  now: number = Date.now(),
): T | null {
  let rows: { payload: string; fetchedAt: number }[];
  try {
    rows = db().select().from(cache).where(eq(cache.key, key)).limit(1).all();
  } catch (error) {
    // The cache is an optimisation, not a data source. An unmigrated or
    // unreadable database must degrade to a miss so the live fetch still runs
    // and the report still reports honestly, rather than taking the run down.
    console.warn(`[preflight] cache unreadable, treating as a miss: ${describe(error)}`);
    return null;
  }
  const row = rows[0];
  if (!row) return null;
  if (now - row.fetchedAt > ttlMs) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch (error) {
    // A corrupt row must not take the report down; treat it as a cache miss.
    console.warn(`[preflight] discarding unparsable cache row ${key}:`, error);
    return null;
  }
}

export function writeCache(
  key: string,
  payload: unknown,
  now: number = Date.now(),
): void {
  try {
    db()
      .insert(cache)
      .values({ key, payload: JSON.stringify(payload), fetchedAt: now })
      .onConflictDoUpdate({
        target: cache.key,
        set: { payload: JSON.stringify(payload), fetchedAt: now },
      })
      .run();
  } catch (error) {
    // Failing to cache costs a repeated upstream call; failing the run costs
    // the report. The fetch already succeeded, so the caller keeps its value.
    console.warn(`[preflight] cache unwritable, continuing: ${describe(error)}`);
  }
}

/** One line of cause, so a cache warning never dumps a stack into --json. */
function describe(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, " ")
    .slice(0, 160);
}
