export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /** Bounds memory; the table is cleared when full. */
  maxKeys?: number;
}

/**
 * Fixed-window limiter kept in memory. In Cloudflare it is per isolate, so it is best effort:
 * it slows down abuse of the free request quota but is not a hard guarantee.
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: RateLimitOptions) {
  const hits = new Map<string, { start: number; count: number }>();
  return (key: string, now: number): boolean => {
    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      if (!entry && hits.size >= maxKeys) hits.clear();
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
