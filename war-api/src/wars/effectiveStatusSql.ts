import { sql, type Expression, type SqlBool } from 'kysely';

/**
 * SQL counterpart of `effectiveStatus` (spec §4, "Effective status"): a War whose
 * `ends_at` is at or before `now` is closed whatever its stored status says, so
 * list filters agree with what the presenters report. `now` is passed in (the
 * request's own clock reading) rather than using the database's `now()`, so one
 * request sees one instant and tests can reason about it. Columns are qualified
 * with `wars.` so it composes into any query selecting from that table.
 */
export function hasEffectiveStatus(status: string, now: Date): Expression<SqlBool> {
  if (status === 'closed') {
    return sql<SqlBool>`(wars.status = 'closed' OR wars.ends_at <= ${now})`;
  }
  return sql<SqlBool>`(wars.status = ${status} AND (wars.ends_at IS NULL OR wars.ends_at > ${now}))`;
}
