import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { patchContestant } from '../allowedActions.js';
import { listMediaByContestant } from '../../contestants/contestantMediaRepository.js';
import { presentContestant } from '../../contestants/contestantPresenter.js';
import { toolResultForOutcome, toolTextResult, requireVoterId } from '../toolResult.js';
import type { McpToolDeps } from '../toolDeps.js';

const inputSchema = {
  war_id: z.string(),
  contestant_id: z.string(),
  name: z.string().optional(),
  bio: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
};

/**
 * `update_contestant` (spec §7.9), backed by `patchContestant` -- the
 * identical function `PATCH /wars/:id/contestants/:cId` calls, inheriting
 * its own draft-only ownership guard and contestant-schema validation
 * unchanged.
 */
export function registerUpdateContestantTool(server: McpServer, deps: McpToolDeps): void {
  server.registerTool(
    'update_contestant',
    {
      title: 'Update Contestant',
      description: "Updates a contestant on a draft War. attributes must match keys the War's own contestant_schema declares.",
      inputSchema,
    },
    async (args, extra) => {
      const voterId = requireVoterId(extra as { authInfo?: AuthInfo });
      const outcome = await patchContestant(
        deps.db,
        args.war_id,
        args.contestant_id,
        voterId,
        { name: args.name, bio: args.bio, attributes: args.attributes },
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
