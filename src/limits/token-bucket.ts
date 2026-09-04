/**
 * A token bucket per caller, held in memory (v1.1 D8).
 *
 * In memory is a deliberate limit, not an oversight: the deployment is a
 * single Fly machine with one volume, so one process sees every request. Two
 * machines would each allow the full rate, and the limit would have to move to
 * the database or to a shared store before that happens.
 */

export interface BucketOptions {
  /** Requests allowed per window, and the burst a fresh caller may spend. */
  capacity: number;
  /** Length of the window the capacity refills over, in milliseconds. */
  windowMs: number;
  /** Callers tracked before the least recently seen are forgotten. */
  maxCallers?: number;
}

export interface Decision {
  allowed: boolean;
  /** Whole tokens left after this call. */
  remaining: number;
  /** Milliseconds until one token is available, 0 when allowed. */
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Bounded so a stream of distinct callers cannot grow the map without limit,
 * which would turn a rate limit into a memory leak.
 */
const DEFAULT_MAX_CALLERS = 10_000;

export class TokenBucket {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly windowMs: number;
  private readonly maxCallers: number;

  constructor(options: BucketOptions) {
    this.capacity = options.capacity;
    this.windowMs = options.windowMs;
    this.maxCallers = options.maxCallers ?? DEFAULT_MAX_CALLERS;
  }

  /**
   * Spends one token for `caller`. `now` is injectable so the refill can be
   * tested without waiting for a real minute to pass.
   */
  take(caller: string, now: number = Date.now()): Decision {
    const refillPerMs = this.capacity / this.windowMs;
    const existing = this.buckets.get(caller);
    const tokens = existing
      ? Math.min(
          this.capacity,
          existing.tokens + (now - existing.updatedAt) * refillPerMs,
        )
      : this.capacity;

    if (tokens < 1) {
      this.remember(caller, { tokens, updatedAt: now });
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.ceil((1 - tokens) / refillPerMs),
      };
    }

    const left = tokens - 1;
    this.remember(caller, { tokens: left, updatedAt: now });
    return { allowed: true, remaining: Math.floor(left), retryAfterMs: 0 };
  }

  /** Re-inserts so the map stays in least-recently-seen order for eviction. */
  private remember(caller: string, bucket: Bucket): void {
    this.buckets.delete(caller);
    this.buckets.set(caller, bucket);
    if (this.buckets.size > this.maxCallers) {
      const oldest = this.buckets.keys().next();
      if (!oldest.done) this.buckets.delete(oldest.value);
    }
  }

  /** Callers currently tracked. Exposed so the eviction bound is testable. */
  size(): number {
    return this.buckets.size;
  }
}
