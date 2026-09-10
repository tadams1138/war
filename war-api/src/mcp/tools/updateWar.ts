import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { patchWar } from '../allowedActions.js';
import { countContestantsForWar } from '../../contestants/contestantsRepository.js';
import { presentWarSummary } from '../../wars/warPresenter.js';
import { toolResultForOutcome, toolTextResult, requireVoterId } from '../toolResult.js';
import type { McpToolDeps } from '../toolDeps.js';

const inputSchema = {
  war_id: z.string(),
  title: z.string().optional(),
  category: z.string().nullable().optional(),
  visibility: z.enum(['public', 'invite_only']).optional(),
  contestant_schema: z.array(z.unknown()).optional(),
  ends_at: z.string().nullable().optional(),
};

/**
 * `update_war` (spec §7.9), backed by `patchWar` -- the identical function
 * `PATCH /wars/:id` calls, inheriting its own creator-only, draft-only
 * guard unchanged. A caller who does not own the War, or a War no longer a
 * draft, is rejected exactly as the REST route rejects it.
 */
export function registerUpdateWarTool(server: McpServer, deps: McpToolDeps): void {
  server.registerTool(
    'update_war',
    {
      title: 'Update War',
      description: "Updates a draft War's fields. Rejected if the caller does not own the War, or the War is no longer a draft.",
      inputSchema,
    },
    async (args, extra) => {
      const voterId = requireVoterId(extra as { authInfo?: AuthInfo });
      const outcome = await patchWar(
        deps.db,
        args.war_id,
        voterId,
        {
          title: args.title,
          category: args.category,
          visibility: args.visibility,
          contestantSchema: args.contestant_schema,
          endsAt: args.ends_at,
        },
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return toolResultForOutcome(outcome);
      }
      const contestantCount = await countContestantsForWar(deps.db, outcome.value.id);
      return toolTextResult(presentWarSummary(outcome.value, new Date(), contestantCount));
    },
  );
}
