import type { FastifyReply, FastifyRequest } from 'fastify';

export interface RateLimitWindow {
  windowMs: number;
  max: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

export type RateLimitAttempt = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * In-process, fixed-window limiter keyed by an arbitrary string (a voter
 * id, here) -- per-process state, not shared across instances (spec
 * §8.4 accepts this explicitly for a fixed instance count: "effective
 * limits scale with instance count -- acceptable while instance counts
 * are fixed... A shared counter store becomes necessary before
 * autoscaling"). Entries are never pruned: each distinct key holds a
 * small, fixed amount of state for the process's lifetime. Acceptable
 * at this scale for the same reason the in-process design itself is;
 * revisit alongside moving to a shared store.
 *
 * Every attempt increments every configured window's counter, even one
 * a different window has already blocked -- a script retrying after
 * being throttled by one window still spends its budget in the others.
 */
export class RateLimiter {
  private readonly state = new Map<string, WindowState[]>();

  constructor(private readonly windows: RateLimitWindow[]) {}

  attempt(key: string, now: Date): RateLimitAttempt {
    const nowMs = now.getTime();
    const states = this.state.get(key) ?? this.windows.map((window) => ({ count: 0, resetAt: nowMs + window.windowMs }));
    let retryAfterMs = 0;
    this.windows.forEach((window, i) => {
      const state = states[i]!;
      if (nowMs >= state.resetAt) {
        state.count = 0;
        state.resetAt = nowMs + window.windowMs;
      }
      state.count += 1;
      if (state.count > window.max) {
        retryAfterMs = Math.max(retryAfterMs, state.resetAt - nowMs);
      }
    });
    this.state.set(key, states);
    return retryAfterMs > 0 ? { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) } : { allowed: true };
  }
}

/**
 * The response body JSON Schema every rate-limited route's `429` uses
 * (spec §8.4) -- `retry_after_seconds` mirrors the `Retry-After` header
 * in the body too, so a client need not parse headers to get it.
 */
export const rateLimitedResponseSchema = {
  type: 'object',
  required: ['error', 'retry_after_seconds'],
  properties: {
    error: { type: 'string' },
    retry_after_seconds: { type: 'integer' },
  },
};

/**
 * A Fastify preHandler enforcing `limiter` keyed by `request.voterId`
 * (spec §8.4's per-identity limits) -- must run after the preHandler
 * that populates it (`requireAuth`). Replies 429 with a `Retry-After`
 * header (seconds) instead of calling the route handler when exceeded
 * (spec §8.4/§10.3: "never presented as an error" is the client's job
 * to honour, not built here).
 */
export function rateLimitByVoter(limiter: RateLimiter) {
  return async function preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = limiter.attempt(request.voterId!, new Date());
    if (!result.allowed) {
      await reply
        .code(429)
        .header('Retry-After', String(result.retryAfterSeconds))
        .send({ error: 'rate limited', retry_after_seconds: result.retryAfterSeconds });
    }
  };
}
