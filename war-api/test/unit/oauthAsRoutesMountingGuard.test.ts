import expressBridge from '@fastify/express';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerOAuthAsRoutes } from '../../src/oauth/routes.js';
import type { WarOAuthServerProvider } from '../../src/oauth/provider.js';

/**
 * Design review of 513ee16, Finding 8(a): `registerOAuthAsRoutes` must never
 * be called on a `{ prefix }`-registered child instance -- doing so 404s
 * every request silently, with the explanation living only in a comment.
 * This pins the trap as a thrown error at registration time instead, so the
 * next Express-only route added inside the `API_PREFIX` block fails loudly,
 * immediately, rather than 404ing at request time with no clue why.
 */
describe('registerOAuthAsRoutes refuses a prefixed instance (design review Finding 8(a))', () => {
  it('throws when called on an instance registered with its own { prefix }', async () => {
    // Arrange
    const app = Fastify();
    await app.register(expressBridge);
    let caught: unknown;

    // Act
    await app.register(
      async (instance) => {
        try {
          registerOAuthAsRoutes(instance, '/api/v1', {} as WarOAuthServerProvider);
        } catch (err) {
          caught = err;
        }
      },
      { prefix: '/api/v1' },
    );
    await app.ready();

    // Assert
    expect(caught).toBeInstanceOf(Error);
  });

  it('does not throw when called on the top-level app (no prefix)', async () => {
    // Arrange
    const app = Fastify();
    await app.register(expressBridge);

    // Act & Assert
    expect(() => registerOAuthAsRoutes(app, '/api/v1', {} as WarOAuthServerProvider)).not.toThrow();
  });
});
