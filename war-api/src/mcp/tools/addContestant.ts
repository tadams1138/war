import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { addContestant } from '../allowedActions.js';
import { listMediaByContestant } from '../../contestants/contestantMediaRepository.js';
import { presentContestant } from '../../contestants/contestantPresenter.js';
import { toolResultForOutcome, toolTextResult, requireVoterId } from '../toolResult.js';
import type { McpToolDeps } from '../toolDeps.js';

const inputSchema = {
  war_id: z.string(),
  name: z.string(),
  bio: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
};

/**
 * `add_contestant` (spec §7.9), backed by `addContestant` -- the identical
 * function `POST /wars/:id/contestants` calls, inheriting its own
 * draft-only ownership guard and contestant-schema validation unchanged.
 * An attribute the War's schema does not declare is rejected exactly as the
 * REST route rejects it, and no contestant is created.
 */
export function registerAddContestantTool(server: McpServer, deps: McpToolDeps): void {
  server.registerTool(
    'add_contestant',
    {
      title: 'Add Contestant',
      description: "Adds a contestant to a draft War. attributes must match keys the War's own contestant_schema declares.",
      inputSchema,
    },
    async (args, extra) => {
      const voterId = requireVoterId(extra as { authInfo?: AuthInfo });
      const outcome = await addContestant(
        deps.db,
        { warId: args.war_id, voterId, name: args.name, bio: args.bio, attributes: args.attributes },
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return toolResultForOutcome(outcome);
      }
      const media = await listMediaByContestant(deps.db, outcome.value.contestant.id);
      return toolTextResult(presentContestant(outcome.value.contestant, outcome.value.war, media, deps.publicBaseUrl));
    },
  );
}
