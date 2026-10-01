import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('allows up to the limit per window, per key', () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect([allow('a', 0), allow('a', 10), allow('a', 20)]).toEqual([true, true, false]);
    expect(allow('b', 20)).toBe(true);
    expect(allow('a', 1000)).toBe(true);
  });

  it('bounds memory by clearing when full', () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
    allow('a', 0);
    allow('b', 0);
    allow('c', 0);
    expect(allow('a', 1)).toBe(true);
  });
});
