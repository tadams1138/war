import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { createWarForVoter } from '../allowedActions.js';
import { presentWarSummary } from '../../wars/warPresenter.js';
import { toolResultForOutcome, toolTextResult, requireVoterId } from '../toolResult.js';
import type { McpToolDeps } from '../toolDeps.js';

const inputSchema = {
  title: z.string(),
  category: z.string().nullable().optional(),
  visibility: z.enum(['public', 'invite_only']).optional(),
  contestant_schema: z.array(z.unknown()).optional(),
  ends_at: z.string().nullable().optional(),
};

/**
 * `create_war` (spec §7.9), backed by `createWarForVoter` -- the identical
 * function `POST /wars` calls. An omitted field is simply not passed to
 * that function, so its own default resolves it exactly as it does for a
 * REST caller (e.g. `media_mode`, not exposed as a tool argument at all in
 * this slice, always resolves to the API's own "image" default).
 */
export function registerCreateWarTool(server: McpServer, deps: McpToolDeps): void {
  server.registerTool(
    'create_war',
    {
      title: 'Create War',
      description:
        "Creates a new War owned by the caller, in draft status. Only the fields supplied are sent to the API -- an omitted field takes the API's own default, exactly as it would for a REST caller.",
      inputSchema,
    },
    async (args, extra) => {
      const voterId = requireVoterId(extra as { authInfo?: AuthInfo });
      const outcome = await createWarForVoter(deps.db, {
        creatorId: voterId,
        title: args.title,
        category: args.category,
        visibility: args.visibility,
        contestantSchema: args.contestant_schema,
        endsAt: args.ends_at,
      });
      if (outcome.kind === 'validationError') {
        return toolResultForOutcome(outcome);
      }
      return toolTextResult(presentWarSummary(outcome.war, new Date(), 0));
    },
  );
}
