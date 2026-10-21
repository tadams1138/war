import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';
import { OWNER_ACTIONS } from './ownerActions.js';
import { createdAtText, fetchKeysetPage, type InvalidCursor } from '../shared/keysetCursor.js';

export interface ModerationLogEntry {
  id: string;
  action: string;
  actorVoterId: string;
  targetWarId: string | null;
  targetVoterId: string | null;
  createdAt: Date;
  /** The acting role holder's display name; null if they have none. */
  actorName: string | null;
  /** The target Voter's display name; null when there is no target Voter. */
  targetVoterName: string | null;
  /** The target War's title, removed Wars included; null when there is no target War, it was hard-deleted, or it has no title. */
  targetWarTitle: string | null;
  /** True only when the entry targets a War whose row no longer exists (hard-deleted); a live untitled War is false. */
  targetWarDeleted: boolean;
}

function toEntry(row: ModerationLogRow): ModerationLogEntry {
  return {
    id: row.id,
    action: row.action,
    actorVoterId: row.staff_voter_id,
    targetWarId: row.target_war_id,
    targetVoterId: row.target_voter_id,
    createdAt: new Date(row.created_at),
    actorName: row.actor_name,
    targetVoterName: row.target_voter_name,
    targetWarTitle: row.target_war_title,
    targetWarDeleted: row.target_war_deleted,
  };
}

/** Which entries a reader may see: moderation actions (Moderator), role changes and an Admin's owner actions (Admin), or both. */
export interface ModerationLogVisibility {
  moderation: boolean;
  roleChange: boolean;
  ownerAction: boolean;
}

const ROLE_CHANGE_ACTION = sql<boolean>`moderation_log.action ~ '^(grant|revoke)_role_'`;
const OWNER_ACTION = sql<boolean>`moderation_log.action in (${sql.join(OWNER_ACTIONS)})`;

function visibilityFilter(visibility: ModerationLogVisibility) {
  const kinds = [
    visibility.roleChange ? ROLE_CHANGE_ACTION : null,
    visibility.ownerAction ? OWNER_ACTION : null,
    visibility.moderation ? sql<boolean>`not (${ROLE_CHANGE_ACTION} or ${OWNER_ACTION})` : null,
  ].filter((kind) => kind !== null);
  return kinds.length === 0 ? sql<boolean>`false` : sql<boolean>`(${sql.join(kinds, sql` or `)})`;
}

export type ListModerationLogOutcome = { kind: 'ok'; entries: ModerationLogEntry[]; nextCursor: string | null } | InvalidCursor;

/** Names come from LEFT JOINs in the same statement: the log is append-only and its War target has no foreign key, so a deleted War or Voter yields a null name, never a dropped entry. */
function moderationLogQuery(db: Kysely<Database>, visibility: ModerationLogVisibility) {
  return db
    .selectFrom('moderation_log')
    .leftJoin('voters as actor', 'actor.id', 'moderation_log.staff_voter_id')
    .leftJoin('voters as target_voter', 'target_voter.id', 'moderation_log.target_voter_id')
    .leftJoin('wars as target_war', 'target_war.id', 'moderation_log.target_war_id')
    .where(visibilityFilter(visibility))
    .selectAll('moderation_log')
    .select([
      'actor.display_name as actor_name',
      'target_voter.display_name as target_voter_name',
      'target_war.title as target_war_title',
      sql<boolean>`moderation_log.target_war_id is not null and target_war.id is null`.as('target_war_deleted'),
    ])
    .select(createdAtText('moderation_log.created_at').as('created_at_text'))
    .orderBy('moderation_log.created_at', 'desc')
    .orderBy('moderation_log.id', 'desc');
}

type ModerationLogRow = Awaited<ReturnType<ReturnType<typeof moderationLogQuery>['execute']>>[number];

/** One page of logged moderation, role-change and owner actions, newest first (§6.7); `nextCursor` is set only when a further entry exists. */
export async function listModerationLog(
  db: Kysely<Database>,
  options: { limit: number; cursor?: string; visibility: ModerationLogVisibility },
): Promise<ListModerationLogOutcome> {
  const result = await fetchKeysetPage(moderationLogQuery(db, options.visibility), { createdAtColumn: 'moderation_log.created_at', idColumn: 'moderation_log.id', limit: options.limit, cursor: options.cursor });
  if (result.kind === 'invalidCursor') return result;
  return { kind: 'ok', entries: result.page.map(toEntry), nextCursor: result.nextCursor };
}

export interface LogActionInput {
  action: string;
  actorVoterId: string;
  targetWarId?: string;
  targetVoterId?: string;
}

/** Records one moderation or role-change action (§6.7). Insert-only — there is no update or delete, mirroring votes' own immutability (§8.1). */
export async function logAction(db: Kysely<Database>, input: LogActionInput): Promise<void> {
  await db
    .insertInto('moderation_log')
    .values({
      id: newId(),
      action: input.action,
      staff_voter_id: input.actorVoterId,
      target_war_id: input.targetWarId ?? null,
      target_voter_id: input.targetVoterId ?? null,
    })
    .execute();
}
