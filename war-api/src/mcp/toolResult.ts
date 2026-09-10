import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Forbidden, NotActive, NotDraft, NotFound, ValidationError } from '../shared/outcomes.js';

/** `rankingsFor`'s own failure variant (spec §9) -- not one of `shared/outcomes.ts`'s set, since it is the one function here whose caller can be anonymous over REST (never true for an MCP tool call, but the outcome type itself is shared). */
export interface Unauthorized {
  kind: 'unauthorized';
}

/** Every failure kind a function on the allowlist (`src/mcp/allowedActions.ts`) can return. */
export type ToolFailure = NotFound | Forbidden | NotDraft | NotActive | ValidationError | Unauthorized;

/** Wraps a successful tool result as the single JSON text block every tool in this surface returns. */
export function toolTextResult(payload: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function toolErrorResult(error: string, details?: string[]): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(details ? { error, details } : { error }) }] };
}

/**
 * Maps a failed outcome to a tool result carrying the identical rejection
 * reason its REST counterpart sends (spec §14: "rejected exactly as ...
 * would reject it") -- mirrors `shared/httpOutcomes.ts`'s `replyForOutcome`
 * switch, kept as its own copy rather than reused directly since a tool
 * result's shape (`{ isError, content }`) is not an HTTP response. A `never`
 * default keeps this exhaustive the same way that one is.
 */
export function toolResultForOutcome(outcome: ToolFailure): CallToolResult {
  switch (outcome.kind) {
    case 'notFound':
      return toolErrorResult('not found');
    case 'forbidden':
      return toolErrorResult('forbidden');
    case 'notDraft':
      return toolErrorResult('War is no longer editable');
    case 'notActive':
      return toolErrorResult('War is not active');
    case 'unauthorized':
      return toolErrorResult('unauthorized');
    case 'validationError':
      return toolErrorResult('validation error', outcome.errors);
    default: {
      const exhaustive: never = outcome;
      throw new Error(`unhandled outcome kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Reads the voter id the resource-server bearer check (spec §4.3.6) already
 * resolved before any tool handler ran -- never a second lookup. Every tool
 * in this surface requires an authenticated caller (§7.9's endpoint is
 * bearer-protected in full), so a missing id here means the bearer check was
 * bypassed, which is a defect in the wiring, not a case a tool call can
 * legitimately hit.
 */
export function requireVoterId(extra: { authInfo?: AuthInfo }): string {
  const voterId = extra.authInfo?.extra?.voterId;
  if (typeof voterId !== 'string') {
    throw new Error('MCP tool handler invoked with no authenticated voter id -- the bearer check should have prevented this');
  }
  return voterId;
}
