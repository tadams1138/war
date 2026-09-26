import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { MutationOutcome, NotFound, ValidationError } from '../shared/outcomes.js';
import { findWarById } from '../wars/warsRepository.js';
import {
  createReport,
  listReportsForWar,
  listWarsWithUnaddressedReports,
  setReportAddressed,
  type Report,
  type UnaddressedWarQueueEntry,
} from './reportsRepository.js';

export interface ReportView {
  id: string;
  war_id: string;
  reporter_id: string;
  explanation: string;
  addressed: boolean;
  filed_at: string;
}

export const reportViewSchema = {
  type: 'object',
  required: ['id', 'war_id', 'reporter_id', 'explanation', 'addressed', 'filed_at'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    war_id: { type: 'string', format: 'uuid' },
    reporter_id: { type: 'string', format: 'uuid' },
    explanation: { type: 'string' },
    addressed: { type: 'boolean' },
    filed_at: { type: 'string', format: 'date-time' },
  },
};

export function presentReport(report: Report): ReportView {
  return {
    id: report.id,
    war_id: report.warId,
    reporter_id: report.reporterId,
    explanation: report.explanation,
    addressed: report.addressed,
    filed_at: report.createdAt.toISOString(),
  };
}

function explanationError(explanation: unknown): string | null {
  if (typeof explanation !== 'string' || explanation.length === 0 || explanation.length > 1000) {
    return 'explanation must be a non-empty string of at most 1000 characters';
  }
  return null;
}

export interface FileReportInput {
  warId: string;
  reporterId: string;
  explanation: unknown;
}

export type FileReportOutcome = MutationOutcome<Report, NotFound | ValidationError>;

/** Files one abuse report (spec §8.5) — any authenticated Voter, any War, any number of times; never deduplicated. */
export async function fileReport(db: Kysely<Database>, input: FileReportInput): Promise<FileReportOutcome> {
  const war = await findWarById(db, input.warId);
  if (!war) return { kind: 'notFound' };

  const error = explanationError(input.explanation);
  if (error) return { kind: 'validationError', errors: [error] };

  const report = await createReport(db, { warId: input.warId, reporterId: input.reporterId, explanation: input.explanation as string });
  return { kind: 'ok', value: report };
}

export type ListReportsOutcome = MutationOutcome<Report[], NotFound>;

/** Every report against `warId`, newest first (spec §8.5). 404s if the War itself doesn't exist; caller permission (Moderator/Admin) is enforced by `requireModeratorOrAdmin`, not here. */
export async function listReportsForWarOutcome(db: Kysely<Database>, warId: string): Promise<ListReportsOutcome> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };

  const reports = await listReportsForWar(db, warId);
  return { kind: 'ok', value: reports };
}

export interface UnaddressedWarView {
  war_id: string;
  title: string | null;
  unaddressed_count: number;
}

export const unaddressedWarViewSchema = {
  type: 'object',
  required: ['war_id', 'title', 'unaddressed_count'],
  properties: {
    war_id: { type: 'string', format: 'uuid' },
    title: { type: ['string', 'null'] },
    unaddressed_count: { type: 'integer', minimum: 1 },
  },
};

/** The moderation queue (spec §8.5) — never fails; an empty result just means nothing is waiting. */
export async function unaddressedQueue(db: Kysely<Database>): Promise<UnaddressedWarView[]> {
  const entries = await listWarsWithUnaddressedReports(db);
  return entries.map((entry: UnaddressedWarQueueEntry) => ({
    war_id: entry.warId,
    title: entry.title,
    unaddressed_count: entry.unaddressedCount,
  }));
}

export type SetAddressedOutcome = MutationOutcome<Report, NotFound>;

/** Toggles one report's addressed flag (spec §8.5). Caller permission (Moderator/Admin) is enforced by `requireModeratorOrAdmin`, not here. */
export async function setAddressed(db: Kysely<Database>, reportId: string, addressed: boolean): Promise<SetAddressedOutcome> {
  const report = await setReportAddressed(db, reportId, addressed);
  return report ? { kind: 'ok', value: report } : { kind: 'notFound' };
}
