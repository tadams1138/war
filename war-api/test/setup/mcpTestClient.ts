import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * The shape every tool result in this surface actually produces
 * (`src/mcp/toolResult.ts`: a single JSON text content block, `isError` set
 * only on failure). `client.callTool()`'s declared return type is a
 * compatibility union that also admits a legacy `{ toolResult: unknown }`
 * shape this codebase never produces, so callers narrow with
 * {@link isErrorResult}/{@link parseToolResult} rather than relying on the
 * SDK's own type here.
 */
export interface ToolResultLike {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

/** True when a tool call's result carries `isError: true`. */
export function isErrorResult(result: object): boolean {
  return 'isError' in result && result.isError === true;
}

/**
 * Connects a test `Client` to a real `McpServer` over
 * `InMemoryTransport.createLinkedPair()` (spec §7.9's testing convention),
 * injecting `authInfo` on every outgoing message the way the real
 * Streamable HTTP route attaches it after the resource-server bearer check
 * (§4.3.6) resolves it. The SDK's public `Client` API has no parameter for
 * per-call `authInfo` -- `InMemoryTransport.send` accepts it directly
 * instead, documented by the SDK itself as "useful for testing
 * authentication scenarios" -- so this wraps `send` to attach it to every
 * message the client transport emits, exactly as a real request's
 * `extra.authInfo` would be populated for the tool handler that runs on the
 * server side.
 */
export async function connectMcpTestClient(server: McpServer, voterId: string): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const authInfo: AuthInfo = {
    token: 'test-token',
    clientId: '',
    scopes: [],
    extra: { voterId },
  };
  const originalSend = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) => originalSend(message, { ...options, authInfo });

  await server.connect(serverTransport);

  const client = new Client({ name: 'mcp-tool-surface-test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

/** Parses a tool result's single JSON text content block into `T`. */
export function parseToolResult<T>(result: object): T {
  const { content } = result as ToolResultLike;
  const block = content?.[0];
  if (!block || block.type !== 'text' || typeof block.text !== 'string') {
    throw new Error(`expected a text content block, got ${JSON.stringify(content)}`);
  }
  return JSON.parse(block.text) as T;
}
