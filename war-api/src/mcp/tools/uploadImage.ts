import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { addContestantImage } from '../allowedActions.js';
import { extensionFor } from '../../contestants/imageProcessing.js';
import { toolResultForOutcome, toolTextResult, requireVoterId } from '../toolResult.js';
import type { McpToolDeps } from '../toolDeps.js';

const inputSchema = {
  war_id: z.string(),
  contestant_id: z.string(),
  image_base64: z.string(),
  mime_type: z.string(),
};

/**
 * `upload_image` (spec §7.9), backed by `addContestantImage` -- the
 * identical function the multipart REST route calls. This differs from a
 * REST upload only in encoding: the MCP client, not this API, reads the
 * file from wherever it lives, so the tool takes the file's bytes
 * base64-encoded rather than a multipart part. The existing 10MB size
 * ceiling and image-content validation apply identically after decoding,
 * inside `addContestantImage` itself -- no new limit is introduced here,
 * and none is relaxed.
 */
export function registerUploadImageTool(server: McpServer, deps: McpToolDeps): void {
  server.registerTool(
    'upload_image',
    {
      title: 'Upload Image',
      description: "Uploads a base64-encoded image for a contestant on a draft War. The existing 10MB size ceiling applies after decoding.",
      inputSchema,
    },
    async (args, extra) => {
      const voterId = requireVoterId(extra as { authInfo?: AuthInfo });
      const buffer = Buffer.from(args.image_base64, 'base64');
      const outcome = await addContestantImage(
        deps.db,
        deps.storage,
        {
          warId: args.war_id,
          contestantId: args.contestant_id,
          voterId,
          buffer,
          mimeType: args.mime_type,
          originalExt: extensionFor(args.mime_type),
        },
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return toolResultForOutcome(outcome);
      }
      return toolTextResult({ id: outcome.value.id, display_order: outcome.value.displayOrder });
    },
  );
}
