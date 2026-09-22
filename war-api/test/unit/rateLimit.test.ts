import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/shared/rateLimit.js';

describe('RateLimiter', () => {
  it('allows up to max attempts within a window', () => {
    // Arrange
    const limiter = new RateLimiter([{ windowMs: 60_000, max: 3 }]);
    const now = new Date('2026-01-01T00:00:00.000Z');

    // Act
    const results = [limiter.attempt('voter-1', now), limiter.attempt('voter-1', now), limiter.attempt('voter-1', now)];

    // Assert
    expect(results.every((result) => result.allowed)).toBe(true);
  });

  it('blocks the attempt beyond max, with a retryAfterSeconds until the window resets', () => {
    // Arrange
    const limiter = new RateLimiter([{ windowMs: 60_000, max: 2 }]);
    const start = new Date('2026-01-01T00:00:00.000Z');

    // Act
    limiter.attempt('voter-1', start);
    limiter.attempt('voter-1', start);
    const thirdAttemptAt = new Date(start.getTime() + 10_000);
    const result = limiter.attempt('voter-1', thirdAttemptAt);

    // Assert
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });

  it('resets the window once it elapses', () => {
    // Arrange
    const limiter = new RateLimiter([{ windowMs: 60_000, max: 1 }]);
    const start = new Date('2026-01-01T00:00:00.000Z');

    // Act
    limiter.attempt('voter-1', start);
    const blocked = limiter.attempt('voter-1', new Date(start.getTime() + 30_000));
    const afterWindow = limiter.attempt('voter-1', new Date(start.getTime() + 60_000));

    // Assert
    expect(blocked.allowed).toBe(false);
    expect(afterWindow.allowed).toBe(true);
  });

  it('requires every configured window to pass, and blocks on whichever is exceeded', () => {
    // Arrange — a tight per-minute cap alongside a looser per-day cap.
    const limiter = new RateLimiter([
      { windowMs: 60_000, max: 2 },
      { windowMs: 86_400_000, max: 100 },
    ]);
    const start = new Date('2026-01-01T00:00:00.000Z');

    // Act
    limiter.attempt('voter-1', start);
    limiter.attempt('voter-1', start);
    const blockedByMinuteWindow = limiter.attempt('voter-1', start);

    // Assert — well under the day cap, still blocked by the minute cap.
    expect(blockedByMinuteWindow.allowed).toBe(false);
  });

  it('counts every attempt against every window, even one already blocking the request', () => {
    // Arrange
    const limiter = new RateLimiter([
      { windowMs: 60_000, max: 1 },
      { windowMs: 86_400_000, max: 3 },
    ]);
    const start = new Date('2026-01-01T00:00:00.000Z');

    // Act — 3 attempts, only the first allowed by the per-minute window, but
    // every attempt still consumes a slot of the per-day window.
    limiter.attempt('voter-1', start);
    limiter.attempt('voter-1', start);
    limiter.attempt('voter-1', start);
    // A 4th attempt, in a later minute so the per-minute window resets, must
    // still be blocked -- the per-day window (max 3) is now exhausted too.
    const fourthAttempt = limiter.attempt('voter-1', new Date(start.getTime() + 60_000));

    // Assert
    expect(fourthAttempt.allowed).toBe(false);
  });

  it('tracks keys independently', () => {
    // Arrange
    const limiter = new RateLimiter([{ windowMs: 60_000, max: 1 }]);
    const now = new Date('2026-01-01T00:00:00.000Z');

    // Act
    limiter.attempt('voter-1', now);
    const blockedVoter1 = limiter.attempt('voter-1', now);
    const allowedVoter2 = limiter.attempt('voter-2', now);

    // Assert
    expect(blockedVoter1.allowed).toBe(false);
    expect(allowedVoter2.allowed).toBe(true);
  });
});
