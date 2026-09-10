import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { rankingsFor } from '../allowedActions.js';
import { toolResultForOutcome, toolTextResult, requireVoterId } from '../toolResult.js';
import type { McpToolDeps } from '../toolDeps.js';

const inputSchema = {
  war_id: z.string(),
};

/**
 * `get_rankings` (spec §7.9), backed by `rankingsFor` -- the identical
 * function `GET /wars/:id/rankings` calls, applying its own invite-only
 * membership check unchanged. Added alongside the content-authoring set
 * because a creator checking on a War they built is a natural part of
 * "help me build and edit War content," not a voting action. Unlike the
 * REST route, the caller here is always authenticated (the MCP endpoint's
 * bearer check, §4.3.6, guarantees it), so `viewerId` is never `null`.
 */
export function registerGetRankingsTool(server: McpServer, deps: McpToolDeps): void {
  server.registerTool(
    'get_rankings',
    {
      title: 'Get Rankings',
      description: "Returns a War's leaderboard. Rejected for an invite-only War if the caller is neither its creator nor a member.",
      inputSchema,
    },
    async (args, extra) => {
      const voterId = requireVoterId(extra as { authInfo?: AuthInfo });
      const outcome = await rankingsFor(deps.db, args.war_id, voterId, new Date(), deps.publicBaseUrl);
      if (outcome.kind !== 'ok') {
        return toolResultForOutcome(outcome);
      }
      return toolTextResult(outcome.view);
    },
  );
}
