import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * A fixed-registry test double for the OAuth 2.1 authorization server's
 * client resolution (spec §4.3.3). `authorizationHandler`/`tokenHandler`
 * only ever call `getClient` — they have no opinion on *how* a client_id
 * resolves — so this lets route-level tests exercise the AS's actual wire
 * protocol without a real HTTPS fetch. `CimdClientStore`'s own resolution
 * logic (the SSRF guard, redirect re-validation, document parsing) is
 * covered directly by `test/unit/cimdClientStore.test.ts`.
 */
export class FakeClientsStore implements OAuthRegisteredClientsStore {
  private readonly clients = new Map<string, OAuthClientInformationFull>();

  register(client: OAuthClientInformationFull): void {
    this.clients.set(client.client_id, client);
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }
}
