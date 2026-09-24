import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { loadOwnedWar } from '../wars/warAccess.js';
import type { War } from '../wars/warsRepository.js';
import type { MutationOutcome } from '../shared/outcomes.js';
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

/** A Contestant alongside the War it belongs to, so callers presenting the
 * response never need to re-fetch the War the guard already loaded. */
export interface ContestantWithWar {
  contestant: Contestant;
  war: War;
}

const NAME_LENGTH_ERROR = ['name must be a non-empty string of at most 256 characters'];

function isValidNameLength(name: string): boolean {
  return name.length > 0 && name.length <= 256;
}

function isValidName(name: unknown): name is string {
  return typeof name === 'string' && isValidNameLength(name);
}

/** `undefined` when `name` is absent (patch: no change requested) or valid; the outcome to return otherwise. */
function invalidNameOutcome(name: string | undefined): MutationOutcome<never> | undefined {
  if (name === undefined || isValidNameLength(name)) return undefined;
  return { kind: 'validationError', errors: NAME_LENGTH_ERROR };
}

/** The contestant, only if it belongs to this War -- `null` covers both "doesn't exist" and "wrong War". */
async function findContestantInWar(db: Kysely<Database>, warId: string, contestantId: string): Promise<Contestant | null> {
  const contestant = await findContestantById(db, contestantId);
  if (!contestant || contestant.warId !== warId) return null;
  return contestant;
}

export async function addContestant(
  db: Kysely<Database>,
  input: CreateContestantInput,
  now: Date,
): Promise<MutationOutcome<ContestantWithWar>> {
  const guard = await loadOwnedWar(db, input.warId, input.voterId, now);
  if (guard.kind !== 'ok') return guard;
  const { war } = guard;

  if (!isValidName(input.name)) {
    return { kind: 'validationError', errors: NAME_LENGTH_ERROR };
  }

  const existing = await listContestantsByWar(db, input.warId);
  const contestant = await createContestant(db, {
    warId: input.warId,
    name: input.name,
    bio: input.bio ?? null,
  });
  // Matchups generate incrementally: this new contestant is paired against
  // every contestant already on the roster, not recomputed for the whole
  // War (spec §4 "Matchup").
  await generateMatchupsForNewContestant(
    db,
    input.warId,
    contestant.id,
    existing.map((c) => c.id),
  );
  return { kind: 'ok', value: { contestant, war } };
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
  now: Date,
): Promise<MutationOutcome<ContestantWithWar>> {
  const guard = await loadOwnedWar(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;
  const { war } = guard;

  const contestant = await findContestantInWar(db, warId, contestantId);
  if (!contestant) return { kind: 'notFound' };

  const nameError = invalidNameOutcome(input.name);
  if (nameError) return nameError;

  const updated = await updateContestant(db, contestantId, {
    name: input.name,
    bio: input.bio,
  });
  return { kind: 'ok', value: { contestant: updated, war } };
}

/**
 * Removes a contestant, any status, creator-only (spec §6.1). A contestant
 * with no votes on its matchups is simply removed; one that does carry
 * votes has those votes cleared as part of removing it -- scoped to that
 * contestant's own matchups only, never the whole War -- and every
 * surviving contestant's counters are recomputed from what remains
 * afterward. All in one transaction so a failure partway never leaves a
 * matchup or vote orphaned from a contestant that no longer exists.
 */
export async function removeContestant(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  voterId: string,
  now: Date,
): Promise<MutationOutcome<void>> {
  const guard = await loadOwnedWar(db, warId, voterId, now);
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
  return { kind: 'ok', value: undefined };
}
