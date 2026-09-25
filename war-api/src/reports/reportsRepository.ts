import type { Kysely, Selectable } from 'kysely';
import type { Database, ReportsTable } from '../db/types.js';
import { newId } from '../db/uuid.js';

export interface Report {
  id: string;
  warId: string;
  reporterId: string;
  explanation: string;
  addressed: boolean;
  createdAt: Date;
}

function toReport(row: Selectable<ReportsTable>): Report {
  return {
    id: row.id,
    warId: row.war_id,
    reporterId: row.reporter_id,
    explanation: row.explanation,
    addressed: row.addressed,
    createdAt: new Date(row.created_at),
  };
}

export interface CreateReportInput {
  warId: string;
  reporterId: string;
  explanation: string;
}

/** Inserts one report row. Never deduplicates against existing reports on the same War (spec §8.5: "reports are never deduplicated or merged"). */
export async function createReport(db: Kysely<Database>, input: CreateReportInput): Promise<Report> {
  const row = await db
    .insertInto('reports')
    .values({ id: newId(), war_id: input.warId, reporter_id: input.reporterId, explanation: input.explanation })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toReport(row);
}

/** Every report against `warId`, newest first (spec §8.5). */
export async function listReportsForWar(db: Kysely<Database>, warId: string): Promise<Report[]> {
  const rows = await db
    .selectFrom('reports')
    .selectAll()
    .where('war_id', '=', warId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .execute();
  return rows.map((row) => toReport(row));
}

export interface UnaddressedWarQueueEntry {
  warId: string;
  title: string | null;
  unaddressedCount: number;
}

/** The moderation queue (spec §8.5): every War carrying ≥1 unaddressed report, with that count, ordered by title. */
export async function listWarsWithUnaddressedReports(db: Kysely<Database>): Promise<UnaddressedWarQueueEntry[]> {
  const rows = await db
    .selectFrom('reports')
    .innerJoin('wars', 'wars.id', 'reports.war_id')
    .select(['reports.war_id as warId', 'wars.title as title'])
    .select((eb) => eb.fn.count<string>('reports.id').as('unaddressedCount'))
    .where('reports.addressed', '=', false)
    .groupBy(['reports.war_id', 'wars.title'])
    .orderBy('wars.title')
    .execute();
  return rows.map((row) => ({ warId: row.warId, title: row.title, unaddressedCount: Number(row.unaddressedCount) }));
}

/** Toggles one report's `addressed` flag (spec §8.5: "in either direction"). `undefined` if `reportId` doesn't exist. */
export async function setReportAddressed(db: Kysely<Database>, reportId: string, addressed: boolean): Promise<Report | undefined> {
  const row = await db
    .updateTable('reports')
    .set({ addressed })
    .where('id', '=', reportId)
    .returningAll()
    .executeTakeFirst();
  return row ? toReport(row) : undefined;
}

/** Deletes every report against `warId` — used only by War deletion's cascade (Task 8), since `reports.war_id` carries no `ON DELETE` rule. */
export async function deleteReportsForWar(db: Kysely<Database>, warId: string): Promise<void> {
  await db.deleteFrom('reports').where('war_id', '=', warId).execute();
}
