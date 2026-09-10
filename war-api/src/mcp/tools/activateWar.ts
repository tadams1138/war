import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { activateWar } from '../allowedActions.js';
import { countContestantsForWar } from '../../contestants/contestantsRepository.js';
import { presentWarSummary } from '../../wars/warPresenter.js';
import { toolResultForOutcome, toolTextResult, requireVoterId } from '../toolResult.js';
import type { McpToolDeps } from '../toolDeps.js';

const inputSchema = {
  war_id: z.string(),
};

/**
 * `activate_war` (spec §7.9), backed by `activateWar` -- the identical
 * function `POST /wars/:id/activate` calls, so this slice's existing
 * activation rules (≥2 contestants, each with ≥1 image) surface unchanged.
 */
export function registerActivateWarTool(server: McpServer, deps: McpToolDeps): void {
  server.registerTool(
    'activate_war',
    {
      title: 'Activate War',
      description: 'Activates a draft War, generating its matchups. Rejected if the War has fewer than 2 contestants, or any contestant has no image.',
      inputSchema,
    },
    async (args, extra) => {
      const voterId = requireVoterId(extra as { authInfo?: AuthInfo });
      const outcome = await activateWar(deps.db, args.war_id, voterId, new Date());
      if (outcome.kind !== 'ok') {
        return toolResultForOutcome(outcome);
      }
      const contestantCount = await countContestantsForWar(deps.db, outcome.value.id);
      return toolTextResult(presentWarSummary(outcome.value, new Date(), contestantCount));
    },
  );
}
