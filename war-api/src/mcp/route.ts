import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { WarOAuthServerProvider } from '../oauth/provider.js';
import { protectedResourceMetadataUrl } from '../oauth/resource.js';
import { createMcpServer } from './server.js';
import type { McpToolDeps } from './toolDeps.js';

export interface McpRouteDeps extends McpToolDeps {
  apiBaseUrl: string;
  /** The same `WarOAuthServerProvider` instance `app.ts` builds for the AS's
   * own routes (spec §4.3) -- one resource, one audience, one place the
   * bearer check lives. */
  oauthProvider: WarOAuthServerProvider;
}

/**
 * Mounts the MCP Streamable HTTP endpoint (spec §7.9) as an ordinary,
 * `{ prefix: API_PREFIX }`-registered Fastify route -- never through
 * `@fastify/express` (§4.3.1's bridge exists only for the AS's own two
 * routes, `/oauth/authorize` and `/oauth/token`; nothing about this
 * endpoint asks to be bridged).
 *
 * The bearer check (spec §4.3.6) is a plain Fastify `preHandler`-shaped
 * check inlined into the handler itself (not a separate `preHandler`
 * option) so the `401`'s `WWW-Authenticate` header and the transport
 * handoff share one control-flow path — a request missing, malformed, or
 * wrongly-audienced never reaches `StreamableHTTPServerTransport` at all.
 * On success, `AuthInfo` is attached to `request.raw` as `auth` before
 * `transport.handleRequest` runs, matching that method's own declared
 * parameter type (`req: IncomingMessage & { auth?: AuthInfo }`) — the
 * transport *reads* `auth` from whatever request object it is handed and
 * never constructs one itself.
 *
 * A single `McpServer`/transport pair is built once, at registration time,
 * and reused across every request: the ten tools' registration is fixed
 * for the process's life, and `StreamableHTTPServerTransport` in stateless
 * mode (`sessionIdGenerator: undefined`) carries no per-connection state
 * that would need a fresh instance per request.
 *
 * `reply.hijack()` hands the raw Node response over to the transport
 * entirely -- Fastify must never also try to send a response once
 * `transport.handleRequest` has started writing to `reply.raw`.
 */
export function registerMcpRoute(app: FastifyInstance, deps: McpRouteDeps): void {
  const mcpServer = createMcpServer(deps);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const connected = mcpServer.connect(transport);
  const resourceMetadataUrl = protectedResourceMetadataUrl(deps.apiBaseUrl);

  async function verifyBearerToken(request: FastifyRequest): Promise<AuthInfo> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new Error('missing bearer token');
    }
    return deps.oauthProvider.verifyAccessToken(header.slice('Bearer '.length));
  }

  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    schema: { hide: true },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      let authInfo: AuthInfo;
      try {
        authInfo = await verifyBearerToken(request);
      } catch {
        void reply.header('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
        return reply.code(401).send();
      }

      await connected;
      const raw = request.raw as IncomingMessage & { auth?: AuthInfo };
      raw.auth = authInfo;
      reply.hijack();
      await transport.handleRequest(raw, reply.raw as ServerResponse, request.body);
    },
  });
}
