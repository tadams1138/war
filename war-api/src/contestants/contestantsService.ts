import type { FastifyBaseLogger } from 'fastify';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/types.js';
import { asOwnerAction, type Caller } from '../wars/warAccess.js';
import { contestantMediaPrefixes, deleteMediaObjects } from '../wars/warMediaStorage.js';
import type { ObjectStorage } from './storage.js';
import { nonEmptyStringError } from '../shared/bodyValidation.js';
import type { MutationOutcome, ValidationError } from '../shared/outcomes.js';
import {
  deleteMatchupsByIds,
  findMatchupIdsForContestant,
  generateMatchupsForNewContestant,
} from '../matchups/matchupsRepository.js';
import { deleteVotesForMatchups } from '../votes/votesRepository.js';
import {
  createContestant,
  deleteContestant,
  findContestantById,
  listContestantsByWar,
  recomputeContestantCounters,
  updateContestant,
  type Contestant,
} from './contestantsRepository.js';

export interface CreateContestantInput {
  warId: string;
  caller: Caller;
  name: string;
  bio?: string | null;
}

const MAX_NAME_LENGTH = 256;

/** `undefined` when `name` is valid; otherwise the outcome to return. */
function invalidNameOutcome(name: unknown): ValidationError | undefined {
  const error = nonEmptyStringError('name', name, MAX_NAME_LENGTH);
  return error ? { kind: 'validationError', errors: [error] } : undefined;
}

/** The contestant, only if it belongs to this War -- `null` covers both "doesn't exist" and "wrong War". */
async function findContestantInWar(db: Kysely<Database> | Transaction<Database>, warId: string, contestantId: string): Promise<Contestant | null> {
  const contestant = await findContestantById(db, contestantId);
  if (!contestant || contestant.warId !== warId) return null;
  return contestant;
}

export async function addContestant(db: Kysely<Database>, input: CreateContestantInput): Promise<MutationOutcome<Contestant>> {
  return asOwnerAction(db, input.warId, input.caller, 'add_contestant', async (trx) => {
    const nameError = invalidNameOutcome(input.name);
    if (nameError) return nameError;

    const existing = await listContestantsByWar(trx, input.warId);
    const contestant = await createContestant(trx, {
      warId: input.warId,
      name: input.name,
      bio: input.bio ?? null,
    });
    // Matchups generate incrementally: the new contestant is paired against everyone already on the roster (§4 "Matchup").
    await generateMatchupsForNewContestant(
      trx,
      input.warId,
      contestant.id,
      existing.map((c) => c.id),
    );
    return { kind: 'ok', value: contestant };
  });
}

export interface PatchContestantInput {
  name?: string;
  bio?: string | null;
}

export async function patchContestant(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  caller: Caller,
  input: PatchContestantInput,
): Promise<MutationOutcome<Contestant>> {
  return asOwnerAction<Contestant>(db, warId, caller, 'edit_contestant', async (trx) => {
    const contestant = await findContestantInWar(trx, warId, contestantId);
    if (!contestant) return { kind: 'notFound' };

    const nameError = input.name === undefined ? undefined : invalidNameOutcome(input.name);
    if (nameError) return nameError;

    const updated = await updateContestant(trx, contestantId, {
      name: input.name,
      bio: input.bio,
    });
    return { kind: 'ok', value: updated };
  });
}

/**
 * Removes a contestant, any status, creator-only (§6.1). Votes on its matchups (and only those) are
 * cleared with it and the surviving contestants' counters recomputed, all in one transaction so a failure
 * never leaves a matchup or vote orphaned from a contestant that no longer exists. An Admin's moderation log entry
 * joins that transaction; the stored media objects are deleted best effort after it commits.
 */
export async function removeContestant(
  db: Kysely<Database>,
  storage: ObjectStorage,
  log: FastifyBaseLogger,
  warId: string,
  contestantId: string,
  caller: Caller,
): Promise<MutationOutcome<void>> {
  const removed = await asOwnerAction(db, warId, caller, 'remove_contestant', async (trx) => {
    const contestant = await findContestantInWar(trx, warId, contestantId);
    if (!contestant) return { kind: 'notFound' };

    const matchupIds = await findMatchupIdsForContestant(trx, warId, contestantId);
    if (matchupIds.length > 0) {
      await deleteVotesForMatchups(trx, matchupIds);
      await deleteMatchupsByIds(trx, matchupIds);
    }
    await deleteContestant(trx, contestantId);
    if (matchupIds.length > 0) {
      await recomputeContestantCounters(trx, warId);
    }
    return { kind: 'ok', value: undefined };
  });
  if (removed.kind !== 'ok') return removed;
  await deleteMediaObjects(storage, log, contestantMediaPrefixes([contestantId]), { warId, contestantId });
  return removed;
}
