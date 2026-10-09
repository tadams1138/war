import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/types.js';
import { isUuid } from '../db/uuid.js';
import { createdAtText, fetchKeysetPage, type InvalidCursor } from '../shared/keysetCursor.js';
import type { NotFound } from '../shared/outcomes.js';

export interface AdminVote {
  id: string;
  warId: string;
  warTitle: string | null;
  matchupId: string;
  winnerContestantId: string;
  winnerName: string;
  loserContestantId: string;
  loserName: string;
  castAt: Date;
}

export type ListAdminVotesOutcome = { kind: 'ok'; votes: AdminVote[]; nextCursor: string | null } | NotFound | InvalidCursor;

export interface ListAdminVotesOptions {
  limit: number;
  cursor?: string;
}

async function voterExists(db: Kysely<Database>, voterId: string): Promise<boolean> {
  if (!isUuid(voterId)) return false;
  const row = await db.selectFrom('voters').select('id').where('id', '=', voterId).executeTakeFirst();
  return row !== undefined;
}

function voterVotesQuery(db: Kysely<Database>, voterId: string) {
  return db
    .selectFrom('votes')
    .innerJoin('matchups', 'matchups.id', 'votes.matchup_id')
    .innerJoin('wars', 'wars.id', 'matchups.war_id')
    .innerJoin('contestants as winner', 'winner.id', 'votes.winner_id')
    .innerJoin('contestants as loser', (join) =>
      join.on(
        sql<boolean>`loser.id = case when matchups.contestant_a_id = votes.winner_id then matchups.contestant_b_id else matchups.contestant_a_id end`,
      ),
    )
    .select([
      'votes.id',
      'votes.created_at',
      'votes.matchup_id',
      'votes.winner_id',
      'wars.id as war_id',
      'wars.title as war_title',
      'winner.name as winner_name',
      'loser.id as loser_id',
      'loser.name as loser_name',
    ])
    .select(createdAtText('votes.created_at').as('created_at_text'))
    .where('votes.voter_id', '=', voterId)
    .orderBy('votes.created_at', 'desc')
    .orderBy('votes.id', 'desc');
}

type VoteRow = Awaited<ReturnType<ReturnType<typeof voterVotesQuery>['execute']>>[number];

function toAdminVote(row: VoteRow): AdminVote {
  return {
    id: row.id,
    warId: row.war_id,
    warTitle: row.war_title,
    matchupId: row.matchup_id,
    winnerContestantId: row.winner_id,
    winnerName: row.winner_name,
    loserContestantId: row.loser_id,
    loserName: row.loser_name,
    castAt: new Date(row.created_at),
  };
}

/**
 * One page of every vote `voterId` cast, newest first (§6.7 "Visibility"): removed Wars and other
 * Voters' unlisted or draft Wars included, since the history is the Voter's, not the War's. The loser
 * is the matchup's other contestant; War title and both names arrive in the same query.
 */
export async function listAdminVotes(
  db: Kysely<Database>,
  voterId: string,
  options: ListAdminVotesOptions,
): Promise<ListAdminVotesOutcome> {
  if (!(await voterExists(db, voterId))) return { kind: 'notFound' };
  const result = await fetchKeysetPage(voterVotesQuery(db, voterId), { createdAtColumn: 'votes.created_at', idColumn: 'votes.id', ...options });
  if (result.kind === 'invalidCursor') return result;
  return { kind: 'ok', votes: result.page.map(toAdminVote), nextCursor: result.nextCursor };
}
