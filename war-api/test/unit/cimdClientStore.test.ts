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
