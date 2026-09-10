import { describe, expect, it, vi } from 'vitest';
import { CimdClientStore } from '../../src/oauth/cimdClientStore.js';

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CimdClientStore.getClient (spec §4.3.3)', () => {
  it('rejects a client_id that is not an https:// URL, without ever calling lookup or fetch', async () => {
    // Arrange
    const lookup = vi.fn();
    const fetchImpl = vi.fn();
    const store = new CimdClientStore({ lookup, fetchImpl });

    // Act
    const client = await store.getClient('http://client.test/metadata.json');

    // Assert
    expect(client).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches and accepts a valid client metadata document', async () => {
    // Arrange
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ redirect_uris: ['https://client.test/callback'] }));
    const store = new CimdClientStore({ lookup, fetchImpl });

    // Act
    const client = await store.getClient('https://client.test/metadata.json');

    // Assert
    expect(client).toBeDefined();
    expect(client?.client_id).toBe('https://client.test/metadata.json');
    expect(client?.redirect_uris).toEqual(['https://client.test/callback']);
  });

  it('refuses a document with no redirect_uris', async () => {
    // Arrange
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const store = new CimdClientStore({ lookup, fetchImpl });

    // Act
    const client = await store.getClient('https://client.test/metadata.json');

    // Assert
    expect(client).toBeUndefined();
  });

  it('refuses a client_id resolving to a loopback address, and never fetches it (SSRF guard, spec §4.3.3)', async () => {
    // Arrange
    const lookup = vi.fn().mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const fetchImpl = vi.fn();
    const store = new CimdClientStore({ lookup, fetchImpl });

    // Act
    const client = await store.getClient('https://attacker.test/metadata.json');

    // Assert
    expect(client).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a client_id resolving to a private address, and never fetches it', async () => {
    // Arrange
    const lookup = vi.fn().mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    const fetchImpl = vi.fn();
    const store = new CimdClientStore({ lookup, fetchImpl });

    // Act
    const client = await store.getClient('https://attacker.test/metadata.json');

    // Assert
    expect(client).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('re-validates a redirect target before following it, refusing one that resolves to a private address', async () => {
    // Arrange
    const lookup = vi.fn().mockImplementation(async (hostname: string) => {
      if (hostname === 'client.test') return [{ address: '93.184.216.34', family: 4 }];
      if (hostname === 'internal.test') return [{ address: '10.0.0.9', family: 4 }];
      throw new Error(`unexpected lookup: ${hostname}`);
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://internal.test/metadata.json' } }),
    );
    const store = new CimdClientStore({ lookup, fetchImpl });

    // Act
    const client = await store.getClient('https://client.test/metadata.json');

    // Assert
    expect(client).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1); // never followed the redirect
  });

  it('returns undefined when the fetch fails outright', async () => {
    // Arrange
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network error'));
    const store = new CimdClientStore({ lookup, fetchImpl });

    // Act
    const client = await store.getClient('https://client.test/metadata.json');

    // Assert
    expect(client).toBeUndefined();
  });

  it('refuses a target whose resolved address changes between the pre-check and the actual connection (DNS rebinding, design review Finding 3)', async () => {
    // Arrange: a hostname that resolves to a public address on the first
    // lookup (the pre-check, `isSafeToFetch`) and a private one on every
    // lookup after that (the connection undici performs internally when the
    // real fetch actually dials out) -- the race a 0-TTL DNS record wins
    // deterministically against a check-then-fetch guard. No real DNS or
    // network access is exercised: this hostname is never resolved for
    // real, because a connect-time guard must replace DNS resolution
    // entirely, not merely consult it a second time.
    let calls = 0;
    const lookup = vi.fn().mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }];
    });
    const store = new CimdClientStore({ lookup });

    // Act
    const client = await store.getClient('https://rebinding-attacker.test/metadata.json');

    // Assert: refused, and the address was actually re-checked at least
    // once more after the pre-check -- a store that only ever asked once
    // would leak this exploit through unnoticed.
    expect(client).toBeUndefined();
    expect(calls).toBeGreaterThan(1);
  });

  it('returns undefined when the response is not ok', async () => {
    // Arrange
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'not found' }, { status: 404 }));
    const store = new CimdClientStore({ lookup, fetchImpl });

    // Act
    const client = await store.getClient('https://client.test/metadata.json');

    // Assert
    expect(client).toBeUndefined();
  });
});

/**
 * Design review of 513ee16, Finding 4: the cache had no size bound and no
 * eviction -- the TTL was consulted only on read, so N distinct `client_id`
 * URLs left N entries resident for the process's lifetime.
 */
describe('CimdClientStore cache bounds (spec §4.3.3, design review Finding 4)', () => {
  // A fresh `Response` per call -- a `Response` body can only be read once,
  // and every `getClient` call reads it.
  function anyClientDocumentFetchImpl() {
    return vi.fn().mockImplementation(async () => jsonResponse({ redirect_uris: ['https://any-client.test/callback'] }));
  }

  it('never lets the cache grow past its configured maximum size', async () => {
    // Arrange
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const store = new CimdClientStore({ lookup, fetchImpl: anyClientDocumentFetchImpl(), maxCacheEntries: 2 });

    // Act: three distinct client_ids, one more than the configured maximum.
    await store.getClient('https://client-0.test/metadata.json');
    await store.getClient('https://client-1.test/metadata.json');
    await store.getClient('https://client-2.test/metadata.json');

    // Assert
    expect(store.cacheSize).toBeLessThanOrEqual(2);
  });

  it('purges an expired entry when a new one is inserted, rather than leaving it resident indefinitely', async () => {
    // Arrange: `now` is injected specifically to make the TTL testable
    // (design review Finding 5(b)).
    let now = 0;
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const store = new CimdClientStore({ lookup, fetchImpl: anyClientDocumentFetchImpl(), now: () => now });

    // Act
    await store.getClient('https://client-a.test/metadata.json');
    expect(store.cacheSize).toBe(1);

    now += 61 * 1000; // past the 60s cache TTL
    await store.getClient('https://client-b.test/metadata.json');

    // Assert: inserting the second entry purged the first, expired one --
    // the resident count reflects only the live entry, not both.
    expect(store.cacheSize).toBe(1);
  });
});
