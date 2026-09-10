import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { ObjectStorage } from '../contestants/storage.js';

/**
 * The dependencies every MCP tool handler needs (spec §7.9) — the same three
 * a REST route handler for the equivalent endpoint already receives
 * (`db`, `storage`, `publicBaseUrl`), collected once so `src/mcp/server.ts`
 * and every file under `src/mcp/tools/` share one shape instead of each
 * tool inventing its own dependency list.
 */
export interface McpToolDeps {
  db: Kysely<Database>;
  storage: ObjectStorage;
  publicBaseUrl: string;
}
