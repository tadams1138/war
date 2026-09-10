import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWar } from '../allowedActions.js';
import { presentWarDetail } from '../../wars/warPresenter.js';
import { toolResultForOutcome, toolTextResult } from '../toolResult.js';
import type { McpToolDeps } from '../toolDeps.js';

const inputSchema = {
  war_id: z.string(),
};

/**
 * `get_war` (spec §7.9), backed by `getWar` -- no visibility restriction,
 * matching that function's existing behavior exactly (the same as
 * `GET /wars/:id`, which applies no ownership or membership check either).
 */
export function registerGetWarTool(server: McpServer, deps: McpToolDeps): void {
  server.registerTool(
    'get_war',
    {
      title: 'Get War',
      description: "Returns a War's full detail by id, including its contestants. No ownership or visibility restriction is applied, matching GET /wars/:id.",
      inputSchema,
    },
    async (args) => {
      const lookup = await getWar(deps.db, args.war_id);
      if (lookup.kind === 'notFound') {
        return toolResultForOutcome(lookup);
      }
      const detail = await presentWarDetail(deps.db, lookup.war, new Date(), deps.publicBaseUrl);
      return toolTextResult(detail);
    },
  );
}
