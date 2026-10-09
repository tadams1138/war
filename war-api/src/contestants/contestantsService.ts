import type { FastifyBaseLogger } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { loadOwnedWar } from '../wars/warAccess.js';
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
  voterId: string;
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
async function findContestantInWar(db: Kysely<Database>, warId: string, contestantId: string): Promise<Contestant | null> {
  const contestant = await findContestantById(db, contestantId);
  if (!contestant || contestant.warId !== warId) return null;
  return contestant;
}

export async function addContestant(db: Kysely<Database>, input: CreateContestantInput): Promise<MutationOutcome<Contestant>> {
  const guard = await loadOwnedWar(db, input.warId, input.voterId);
  if (guard.kind !== 'ok') return guard;

  const nameError = invalidNameOutcome(input.name);
  if (nameError) return nameError;

  const existing = await listContestantsByWar(db, input.warId);
  const contestant = await createContestant(db, {
    warId: input.warId,
    name: input.name,
    bio: input.bio ?? null,
  });
  // Matchups generate incrementally: the new contestant is paired against everyone already on the roster (§4 "Matchup").
  await generateMatchupsForNewContestant(
    db,
    input.warId,
    contestant.id,
    existing.map((c) => c.id),
  );
  return { kind: 'ok', value: contestant };
}

export interface PatchContestantInput {
  name?: string;
  bio?: string | null;
}

export async function patchContestant(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  voterId: string,
  input: PatchContestantInput,
): Promise<MutationOutcome<Contestant>> {
  const guard = await loadOwnedWar(db, warId, voterId);
  if (guard.kind !== 'ok') return guard;

  const contestant = await findContestantInWar(db, warId, contestantId);
  if (!contestant) return { kind: 'notFound' };

  const nameError = input.name === undefined ? undefined : invalidNameOutcome(input.name);
  if (nameError) return nameError;

  const updated = await updateContestant(db, contestantId, {
    name: input.name,
    bio: input.bio,
  });
  return { kind: 'ok', value: updated };
}

/**
 * Removes a contestant, any status, creator-only (§6.1). Votes on its matchups (and only those) are
 * cleared with it and the surviving contestants' counters recomputed, all in one transaction so a failure
 * never leaves a matchup or vote orphaned from a contestant that no longer exists.
 */
export async function removeContestant(
  db: Kysely<Database>,
  storage: ObjectStorage,
  log: FastifyBaseLogger,
  warId: string,
  contestantId: string,
  voterId: string,
): Promise<MutationOutcome<void>> {
  const guard = await loadOwnedWar(db, warId, voterId);
  if (guard.kind !== 'ok') return guard;

  const contestant = await findContestantInWar(db, warId, contestantId);
  if (!contestant) return { kind: 'notFound' };

  await db.transaction().execute(async (trx) => {
    const matchupIds = await findMatchupIdsForContestant(trx, warId, contestantId);
    if (matchupIds.length > 0) {
      await deleteVotesForMatchups(trx, matchupIds);
      await deleteMatchupsByIds(trx, matchupIds);
    }
    await deleteContestant(trx, contestantId);
    if (matchupIds.length > 0) {
      await recomputeContestantCounters(trx, warId);
    }
  });
  await deleteMediaObjects(storage, log, contestantMediaPrefixes([contestantId]), { warId, contestantId });
  return { kind: 'ok', value: undefined };
}
