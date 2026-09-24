import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { effectiveStatus } from '../wars/effectiveStatus.js';
import { findWarById, isMember } from '../wars/warsRepository.js';
import { findMatchupById, type Matchup } from '../matchups/matchupsRepository.js';
import { isLeftSide } from '../matchups/stableHash.js';
import { castVote, findVote, type Vote } from './votesRepository.js';

export type CastVoteOutcome =
  | { kind: 'created'; vote: Vote }
  | { kind: 'retried' }
  | { kind: 'conflict' }
  | { kind: 'invalidWinner' }
  | { kind: 'warNotPublished' }
  | { kind: 'notJoined' }
  | { kind: 'notFound' };

export interface CastVoteInput {
  warId: string;
  matchupId: string;
  voterId: string;
  winnerId: string;
}

/** A second vote naming the same winner is idempotent (spec: "a vote is final"); a different winner conflicts. */
function outcomeForVote(recordedWinnerId: string, winnerId: string): CastVoteOutcome {
  return recordedWinnerId === winnerId ? { kind: 'retried' } : { kind: 'conflict' };
}

/** The War itself must exist, be published by effective status, and have this voter as a member. */
async function resolvePublishedJoinedWar(
  db: Kysely<Database>,
  input: CastVoteInput,
  now: Date,
): Promise<CastVoteOutcome | null> {
  const war = await findWarById(db, input.warId);
  if (!war) return { kind: 'notFound' };
  if (effectiveStatus(war, now) !== 'published') return { kind: 'warNotPublished' };
  if (!(await isMember(db, input.warId, input.voterId))) return { kind: 'notJoined' };
  return null;
}

/** The matchup must exist within this War, and the named winner must be one of its two contestants. */
async function resolveValidMatchup(
  db: Kysely<Database>,
  input: CastVoteInput,
): Promise<{ matchup: Matchup } | { outcome: CastVoteOutcome }> {
  const matchup = await findMatchupById(db, input.matchupId);
  if (!matchup || matchup.warId !== input.warId) {
    return { outcome: { kind: 'notFound' } };
  }
  if (input.winnerId !== matchup.contestantAId && input.winnerId !== matchup.contestantBId) {
    return { outcome: { kind: 'invalidWinner' } };
  }
  return { matchup };
}

/** Inserts the vote, or reports the idempotent/conflicting outcome the repository's ON CONFLICT resolved. */
async function insertOrIdempotentOutcome(
  db: Kysely<Database>,
  matchup: Matchup,
  input: CastVoteInput,
): Promise<CastVoteOutcome> {
  const presentedLeftId = isLeftSide(matchup.id, input.voterId) ? matchup.contestantAId : matchup.contestantBId;
  const result = await castVote(db, matchup, input.voterId, input.winnerId, presentedLeftId);
  if (!result.inserted) return outcomeForVote(result.vote.winnerId, input.winnerId);
  return { kind: 'created', vote: result.vote };
}

/** Casts a vote, enforcing war-spec.md §6.3's rules: published War, joined voter, valid winner, final vote. */
export async function castVoteForVoter(
  db: Kysely<Database>,
  input: CastVoteInput,
  now: Date = new Date(),
): Promise<CastVoteOutcome> {
  const warOutcome = await resolvePublishedJoinedWar(db, input, now);
  if (warOutcome) return warOutcome;

  const matchupResolution = await resolveValidMatchup(db, input);
  if ('outcome' in matchupResolution) return matchupResolution.outcome;

  // Cheap fast path preserving the existing pre-check messages; the
  // repository's ON CONFLICT is the real arbiter for a concurrent retry,
  // since two requests can both pass this check.
  const existing = await findVote(db, input.matchupId, input.voterId);
  if (existing) return outcomeForVote(existing.winnerId, input.winnerId);

  return insertOrIdempotentOutcome(db, matchupResolution.matchup, input);
}
