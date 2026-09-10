import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { closeWar } from '../allowedActions.js';
import { countContestantsForWar } from '../../contestants/contestantsRepository.js';
import { presentWarSummary } from '../../wars/warPresenter.js';
import { toolResultForOutcome, toolTextResult, requireVoterId } from '../toolResult.js';
import type { McpToolDeps } from '../toolDeps.js';

const inputSchema = {
  war_id: z.string(),
};

/**
 * `close_war` (spec §7.9), backed by `closeWar` -- the identical function
 * `POST /wars/:id/close` calls, inheriting its own creator-only,
 * active-only guard unchanged.
 */
export function registerCloseWarTool(server: McpServer, deps: McpToolDeps): void {
  server.registerTool(
    'close_war',
    {
      title: 'Close War',
      description: 'Closes an active War. Rejected if the caller does not own the War, or the War is not active.',
      inputSchema,
    },
    async (args, extra) => {
      const voterId = requireVoterId(extra as { authInfo?: AuthInfo });
      const outcome = await closeWar(deps.db, args.war_id, voterId, new Date());
      if (outcome.kind !== 'ok') {
        return toolResultForOutcome(outcome);
      }
      const contestantCount = await countContestantsForWar(deps.db, outcome.value.id);
      return toolTextResult(presentWarSummary(outcome.value, new Date(), contestantCount));
    },
  );
}
