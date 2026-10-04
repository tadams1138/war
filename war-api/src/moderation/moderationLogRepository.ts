import type { Kysely, Selectable } from 'kysely';
import { sql } from 'kysely';
import type { Database, ModerationLogTable } from '../db/types.js';
import { newId } from '../db/uuid.js';

export interface ModerationLogEntry {
  id: string;
  action: string;
  staffVoterId: string;
  targetWarId: string | null;
  targetVoterId: string | null;
  createdAt: Date;
}

function toEntry(row: Selectable<ModerationLogTable>): ModerationLogEntry {
  return {
    id: row.id,
    action: row.action,
    staffVoterId: row.staff_voter_id,
    targetWarId: row.target_war_id,
    targetVoterId: row.target_voter_id,
    createdAt: new Date(row.created_at),
  };
}

export const DEFAULT_MODERATION_LOG_LIMIT = 50;

export type ListModerationLogOutcome =
  | { kind: 'ok'; entries: ModerationLogEntry[]; nextCursor: string | null }
  | { kind: 'invalidCursor' };

/** Keyset position: the last entry's `created_at` as the database's own microsecond-precision UTC text (a JS Date would truncate to milliseconds), and its id. */
interface Cursor {
  v: string;
  id: string;
}

const CREATED_AT_TEXT = sql<string>`to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function matches(value: unknown, pattern: RegExp): boolean {
  return typeof value === 'string' && pattern.test(value);
}

function isCursor(value: unknown): value is Cursor {
  if (typeof value !== 'object' || value === null) return false;
  const { v, id } = value as Record<string, unknown>;
  return matches(v, CURSOR_TIMESTAMP_PATTERN) && matches(id, UUID_PATTERN);
}

/** Decodes an opaque base64 JSON cursor; `undefined` when malformed. Every field is validated here so nothing unvalidated reaches the database. */
function decodeCursor(raw: string): Cursor | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return isCursor(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

type LogRow = Selectable<ModerationLogTable> & { created_at_text: string };

/** Fetching `limit + 1` rows is how "more exist" is known; the extra row is dropped and only its existence is reported. */
function toOkOutcome(rows: LogRow[], limit: number): ListModerationLogOutcome {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last ? encodeCursor({ v: last.created_at_text, id: last.id }) : null;
  return { kind: 'ok', entries: page.map((row) => toEntry(row)), nextCursor };
}

/** One page of logged Staff actions, newest first (spec §6.7); `nextCursor` is set only when a further entry exists. */
export async function listModerationLog(
  db: Kysely<Database>,
  options: { limit: number; cursor?: string },
): Promise<ListModerationLogOutcome> {
  let query = db
    .selectFrom('moderation_log')
    .selectAll()
    .select(CREATED_AT_TEXT.as('created_at_text'))
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc');

  if (options.cursor !== undefined) {
    const cursor = decodeCursor(options.cursor);
    if (!cursor) return { kind: 'invalidCursor' };
    query = query.where(() => sql<boolean>`(created_at, id) < (${cursor.v}::timestamptz, ${cursor.id}::uuid)`);
  }

  return toOkOutcome(await query.limit(options.limit + 1).execute(), options.limit);
}

export interface LogActionInput {
  action: string;
  staffVoterId: string;
  targetWarId?: string;
  targetVoterId?: string;
}

/** Records one Staff action (spec §6.7). Insert-only — there is no update or delete, mirroring votes' own immutability (§8.1). */
export async function logAction(db: Kysely<Database>, input: LogActionInput): Promise<void> {
  await db
    .insertInto('moderation_log')
    .values({
      id: newId(),
      action: input.action,
      staff_voter_id: input.staffVoterId,
      target_war_id: input.targetWarId ?? null,
      target_voter_id: input.targetVoterId ?? null,
    })
    .execute();
}
