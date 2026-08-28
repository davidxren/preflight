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
  const rows = db().select().from(cache).where(eq(cache.key, key)).limit(1).all();
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
  db()
    .insert(cache)
    .values({ key, payload: JSON.stringify(payload), fetchedAt: now })
    .onConflictDoUpdate({
      target: cache.key,
      set: { payload: JSON.stringify(payload), fetchedAt: now },
    })
    .run();
}
