import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { listWarsForVoter } from '../allowedActions.js';
import { countContestantsByWarIds } from '../../contestants/contestantsRepository.js';
import { presentWarSummary } from '../../wars/warPresenter.js';
import { toolTextResult, requireVoterId } from '../toolResult.js';
import type { McpToolDeps } from '../toolDeps.js';

const inputSchema = {
  status: z.string().optional(),
  category: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().optional(),
};

/**
 * `list_my_wars` (spec §7.9), backed by `listWarsForVoter` -- applies
 * `GET /wars?creator=me`'s own default in full when no arguments are given:
 * every status the authenticated voter's own Wars hold, including drafts
 * and invite-only ones, never a narrower scope invented at this layer.
 */
export function registerListMyWarsTool(server: McpServer, deps: McpToolDeps): void {
  server.registerTool(
    'list_my_wars',
    {
      title: 'List My Wars',
      description:
        'Lists every War the caller created, across every status (including drafts and invite-only Wars) unless narrowed by status/category.',
      inputSchema,
    },
    async (args, extra) => {
      const voterId = requireVoterId(extra as { authInfo?: AuthInfo });
      const wars = await listWarsForVoter(deps.db, voterId, {
        status: args.status,
        category: args.category,
        cursor: args.cursor,
        limit: args.limit,
      });
      const counts = await countContestantsByWarIds(
        deps.db,
        wars.map((war) => war.id),
      );
      const now = new Date();
      return toolTextResult(wars.map((war) => presentWarSummary(war, now, counts.get(war.id) ?? 0)));
    },
  );
}
