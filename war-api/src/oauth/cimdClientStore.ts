import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { isDisallowedHostAddress } from './ipGuard.js';

const FETCH_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 64 * 1024; // a client metadata document is a few fields of JSON
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 60 * 1000;
/**
 * Caps how many distinct `client_id`s this store keeps a cached document
 * for at once (design review of 513ee16, Finding 4: an unbounded `Map`,
 * keyed by a client-supplied URL, is a memory-exhaustion surface on an
 * unauthenticated endpoint). Generous for this slice's expected traffic —
 * this bounds the failure mode, it does not tune for capacity.
 */
const MAX_CACHE_ENTRIES = 500;

interface LookupAddress {
  address: string;
  family: number;
}

export interface CimdDeps {
  /** Injectable so tests never make a real DNS query — defaults to `dns/promises`. */
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
  /** Injectable so tests never make a real network call — defaults to `undici`'s own `fetch` (see the constructor's comment for why not the global one). */
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Injectable so a test can observe eviction without inserting {@link MAX_CACHE_ENTRIES} real entries. */
  maxCacheEntries?: number;
}

interface ClientMetadataDocument {
  redirect_uris?: unknown;
  client_name?: unknown;
}

/**
 * Resolves an `https://` `client_id` URL to its Client ID Metadata Document
 * (spec §4.3.3) — the slice 1 registration mechanism: no registration call,
 * no `oauth_clients` row (that table is Dynamic Client Registration's own,
 * slice 3).
 *
 * Fetching an arbitrary client-supplied URL is a real SSRF surface, so every
 * hop (the initial URL and any redirect target) is resolved and checked
 * against {@link isDisallowedHostAddress} *before* it is ever requested --
 * a cheap pre-check, kept as defence in depth -- and again, authoritatively,
 * at the moment a connection is actually opened (design review of 513ee16,
 * Finding 3): resolving a name and then fetching that same name lets an
 * attacker who controls its DNS (every CIMD client, by construction) answer
 * differently the second time, winning a rebinding race the pre-check alone
 * cannot close. {@link guardedLookup} replaces DNS resolution for every
 * fetch this store makes, via an `undici` `Agent`'s own `connect.lookup`
 * hook, so there is no gap between "checked" and "connected to" for the
 * pre-check to be raced against.
 */
export class CimdClientStore implements OAuthRegisteredClientsStore {
  private readonly lookupHost: (hostname: string) => Promise<LookupAddress[]>;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly cache = new Map<string, { client: OAuthClientInformationFull; fetchedAt: number }>();
  private readonly dispatcher: Agent;
  private readonly maxCacheEntries: number;

  constructor(deps: CimdDeps = {}) {
    this.lookupHost = deps.lookup ?? ((hostname: string) => dnsLookup(hostname, { all: true }));
    this.maxCacheEntries = deps.maxCacheEntries ?? MAX_CACHE_ENTRIES;
    // The default must be `undici`'s own `fetch`, not the global one: Node's
    // global `fetch` is backed by its *own internal* copy of `undici` and
    // silently ignores a `dispatcher` built from this package's `Agent`
    // (confirmed empirically -- the global fetch's own `dispatcher` check is
    // an `instanceof` against its internal class, which this package's
    // `Agent` is not). Without this, {@link guardedLookup} would never run
    // and Finding 3's fix would be inert for exactly the default path a real
    // deployment uses.
    this.fetchImpl = deps.fetchImpl ?? (undiciFetch as unknown as typeof fetch);
    this.now = deps.now ?? (() => Date.now());
    this.dispatcher = new Agent({ connect: { lookup: this.guardedLookup } });
  }

  /**
   * A `node:net`-shaped `lookup` function (spec §4.3.3, design review
   * Finding 3): resolves via {@link lookupHost} -- the same injectable
   * resolver the pre-check uses, so a test can make the two calls answer
   * differently -- and refuses the connection outright (an error passed to
   * `callback`, never a socket opened) when any resolved address is
   * disallowed. Runs at the moment `undici` actually dials a connection for
   * every hop this store fetches, closing the gap between "checked" and
   * "connected to."
   */
  private readonly guardedLookup: LookupFunction = (hostname, options, callback) => {
    this.lookupHost(hostname).then(
      (addresses) => {
        if (addresses.length === 0 || addresses.some((entry) => isDisallowedHostAddress(entry.address))) {
          callback(new Error(`refusing to connect: ${hostname} resolves to a disallowed address`), '');
          return;
        }
        if (options.all) {
          callback(null, addresses);
        } else {
          callback(null, addresses[0]!.address, addresses[0]!.family);
        }
      },
      (err: NodeJS.ErrnoException) => callback(err, ''),
    );
  };

  /** Exposed for tests (design review Finding 4/5(b)): the number of resident cache entries right now. */
  get cacheSize(): number {
    return this.cache.size;
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    if (!clientId.startsWith('https://')) {
      return undefined;
    }

    const cached = this.cache.get(clientId);
    if (cached && this.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.client;
    }

    const document = await this.fetchDocument(clientId);
    if (!document) {
      return undefined;
    }

    const redirectUris = Array.isArray(document.redirect_uris) ? document.redirect_uris.filter((uri) => typeof uri === 'string') : [];
    if (redirectUris.length === 0) {
      return undefined;
    }

    const client: OAuthClientInformationFull = {
      client_id: clientId,
      redirect_uris: redirectUris,
      client_name: typeof document.client_name === 'string' ? document.client_name : undefined,
    };
    this.cacheInsert(clientId, client);
    return client;
  }

  /**
   * Inserts a freshly fetched document, first reclaiming space so the cache
   * never grows without bound (design review Finding 4): every already-
   * expired entry is purged (a `client_id` fetched once and never asked
   * about again does not sit resident for the process's lifetime), and if
   * the cache is still at its cap afterwards, the oldest surviving entry is
   * evicted — `Map` preserves insertion order, so its first key is always
   * the oldest.
   */
  private cacheInsert(clientId: string, client: OAuthClientInformationFull): void {
    const now = this.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.fetchedAt >= CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }
    if (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(clientId, { client, fetchedAt: now });
  }

  /** Fetches `url`, following up to {@link MAX_REDIRECTS} redirects, re-validating each hop's resolved address. */
  private async fetchDocument(url: string): Promise<ClientMetadataDocument | undefined> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const safe = await this.isSafeToFetch(current);
      if (!safe) {
        return undefined;
      }

      const response = await this.fetchOnce(current);
      if (!response) {
        return undefined;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return undefined;
        }
        current = new URL(location, current).href;
        continue;
      }

      if (!response.ok) {
        return undefined;
      }

      return this.parseBoundedJson(response);
    }
    return undefined; // too many redirects
  }

  private async isSafeToFetch(url: string): Promise<boolean> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:') {
      return false;
    }
    let addresses: LookupAddress[];
    try {
      addresses = await this.lookupHost(parsed.hostname);
    } catch {
      return false;
    }
    if (addresses.length === 0) {
      return false;
    }
    return addresses.every((entry) => !isDisallowedHostAddress(entry.address));
  }

  private async fetchOnce(url: string): Promise<Response | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      // `dispatcher` routes this request's actual connection through
      // `guardedLookup` (Finding 3) -- a non-standard `fetch` option that
      // only `undici`'s own `fetch` honors from an externally constructed
      // `Agent` (see the constructor's comment: Node's *global* `fetch`
      // silently ignores it).
      return await this.fetchImpl(url, {
        redirect: 'manual',
        signal: controller.signal,
        dispatcher: this.dispatcher,
      } as RequestInit);
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseBoundedJson(response: Response): Promise<ClientMetadataDocument | undefined> {
    const body = response.body;
    if (!body) {
      return undefined;
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          return undefined;
        }
        chunks.push(value);
      }
    } catch {
      return undefined;
    }
    try {
      const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf-8');
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === 'object' && parsed !== null ? (parsed as ClientMetadataDocument) : undefined;
    } catch {
      return undefined;
    }
  }
}
