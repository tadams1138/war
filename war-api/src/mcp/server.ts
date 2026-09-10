import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import packageJson from '../../package.json' with { type: 'json' };
import type { McpToolDeps } from './toolDeps.js';
import { registerCreateWarTool } from './tools/createWar.js';
import { registerUpdateWarTool } from './tools/updateWar.js';
import { registerActivateWarTool } from './tools/activateWar.js';
import { registerCloseWarTool } from './tools/closeWar.js';
import { registerListMyWarsTool } from './tools/listMyWars.js';
import { registerGetWarTool } from './tools/getWar.js';
import { registerAddContestantTool } from './tools/addContestant.js';
import { registerUpdateContestantTool } from './tools/updateContestant.js';
import { registerUploadImageTool } from './tools/uploadImage.js';
import { registerGetRankingsTool } from './tools/getRankings.js';

/**
 * Builds the ten-tool MCP surface (spec §7.9). Each tool handler calls the
 * identical service-layer function the corresponding REST route handler
 * calls -- not a second HTTP request to itself, and not a
 * reimplementation -- so there is exactly one copy of every business rule
 * this document specifies. A fresh `McpServer` is built per call so tests
 * (`InMemoryTransport.createLinkedPair()`) and the real Streamable HTTP
 * route (`src/mcp/route.ts`) each get their own instance rather than
 * sharing mutable server state across connections.
 */
export function createMcpServer(deps: McpToolDeps): McpServer {
  const server = new McpServer({ name: 'war-api', version: packageJson.version });

  registerCreateWarTool(server, deps);
  registerUpdateWarTool(server, deps);
  registerActivateWarTool(server, deps);
  registerCloseWarTool(server, deps);
  registerListMyWarsTool(server, deps);
  registerGetWarTool(server, deps);
  registerAddContestantTool(server, deps);
  registerUpdateContestantTool(server, deps);
  registerUploadImageTool(server, deps);
  registerGetRankingsTool(server, deps);

  return server;
}
