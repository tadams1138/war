import type { RawBuilder } from 'kysely';
import { sql } from 'kysely';
import { isUuid } from '../db/uuid.js';

/**
 * Keyset paging over `(created_at, id)`, newest first, shared by every list
 * endpoint that pages that way (the moderation log, the admin read endpoints).
 *
 * The cursor holds the last row's `created_at` as the database's own
 * microsecond-precision UTC text (a JS Date would truncate to milliseconds and
 * skip or repeat rows created within the same millisecond) and its id.
 */
export interface KeysetCursor {
  v: string;
  id: string;
}

/** A row that can anchor a cursor: select `createdAtText(...)` as `created_at_text`. */
export interface KeysetRow {
  id: string;
  created_at_text: string;
}

const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** The (possibly table-qualified) `created_at` column as microsecond-precision UTC text; select it `.as('created_at_text')`. */
export function createdAtText(column: string): RawBuilder<string> {
  return sql<string>`to_char(${sql.ref(column)} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

function matches(value: unknown, pattern: RegExp): boolean {
  return typeof value === 'string' && pattern.test(value);
}

function isCursor(value: unknown): value is KeysetCursor {
  if (typeof value !== 'object' || value === null) return false;
  const { v, id } = value as Record<string, unknown>;
  return matches(v, CURSOR_TIMESTAMP_PATTERN) && isUuid(id);
}

/** Decodes an opaque base64 JSON cursor; `undefined` when malformed. Every field is validated here so nothing unvalidated reaches the database. */
export function decodeKeysetCursor(raw: string): KeysetCursor | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return isCursor(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function encodeKeysetCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/** The "strictly after this cursor in newest-first order" predicate over the given (possibly table-qualified) columns. */
export function isAfterCursor(createdAtColumn: string, idColumn: string, cursor: KeysetCursor): RawBuilder<boolean> {
  return sql<boolean>`(${sql.ref(createdAtColumn)}, ${sql.ref(idColumn)}) < (${cursor.v}::timestamptz, ${cursor.id}::uuid)`;
}

/** Fetching `limit + 1` rows is how "more exist" is known; the extra row is dropped and only its existence is reported. */
export function sliceKeysetPage<R extends KeysetRow>(rows: R[], limit: number): { page: R[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last ? encodeKeysetCursor({ v: last.created_at_text, id: last.id }) : null;
  return { page, nextCursor };
}
