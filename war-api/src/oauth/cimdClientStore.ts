import { lookup as dnsLookup } from 'node:dns/promises';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { isDisallowedHostAddress } from './ipGuard.js';

const FETCH_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 64 * 1024; // a client metadata document is a few fields of JSON
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 60 * 1000;

interface LookupAddress {
  address: string;
  family: number;
}

export interface CimdDeps {
  /** Injectable so tests never make a real DNS query — defaults to `dns/promises`. */
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
  /** Injectable so tests never make a real network call — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  now?: () => number;
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
 * against {@link isDisallowedHostAddress} *before* it is ever requested.
 */
export class CimdClientStore implements OAuthRegisteredClientsStore {
  private readonly lookupHost: (hostname: string) => Promise<LookupAddress[]>;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly cache = new Map<string, { client: OAuthClientInformationFull; fetchedAt: number }>();

  constructor(deps: CimdDeps = {}) {
    this.lookupHost = deps.lookup ?? ((hostname: string) => dnsLookup(hostname, { all: true }));
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.now = deps.now ?? (() => Date.now());
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
    this.cache.set(clientId, { client, fetchedAt: this.now() });
    return client;
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
      return await this.fetchImpl(url, { redirect: 'manual', signal: controller.signal });
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
