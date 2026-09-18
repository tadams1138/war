import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { loadDraftWarOwnedBy } from '../wars/warAccess.js';
import type { War } from '../wars/warsRepository.js';
import type { MutationOutcome } from '../shared/outcomes.js';
import { validateAttributes, type ContestantSchemaField } from './schemaValidation.js';
import {
  createContestant,
  deleteContestant,
  findContestantById,
  updateContestant,
  type Contestant,
} from './contestantsRepository.js';

export interface CreateContestantInput {
  warId: string;
  voterId: string;
  name: string;
  bio?: string | null;
  attributes?: Record<string, unknown>;
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

type AttributesResult = { ok: true; attributes: Record<string, unknown> } | { ok: false; errors: string[] };

/** Defaults `attributes` to `{}` and validates it against the War's schema -- addContestant's own step. */
function resolveAttributes(schema: ContestantSchemaField[], attributes: Record<string, unknown> | undefined): AttributesResult {
  const resolved = attributes ?? {};
  const validated = validateAttributes(schema, resolved);
  return validated.ok ? { ok: true, attributes: resolved } : { ok: false, errors: validated.errors };
}

/** Validates `attributes` against the War's schema only when the patch actually supplies one. */
function validateOptionalAttributes(
  schema: ContestantSchemaField[],
  attributes: Record<string, unknown> | undefined,
): { ok: true } | { ok: false; errors: string[] } {
  if (attributes === undefined) return { ok: true };
  const validated = validateAttributes(schema, attributes);
  return validated.ok ? { ok: true } : { ok: false, errors: validated.errors };
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
  const guard = await loadDraftWarOwnedBy(db, input.warId, input.voterId, now);
  if (guard.kind !== 'ok') return guard;
  const { war } = guard;

  const attributesResult = resolveAttributes(war.contestantSchema, input.attributes);
  if (!attributesResult.ok) {
    return { kind: 'validationError', errors: attributesResult.errors };
  }

  if (!isValidName(input.name)) {
    return { kind: 'validationError', errors: NAME_LENGTH_ERROR };
  }

  const contestant = await createContestant(db, {
    warId: input.warId,
    name: input.name,
    bio: input.bio ?? null,
    attributes: attributesResult.attributes,
  });
  return { kind: 'ok', value: { contestant, war } };
}

export interface PatchContestantInput {
  name?: string;
  bio?: string | null;
  attributes?: Record<string, unknown>;
}

export async function patchContestant(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  voterId: string,
  input: PatchContestantInput,
  now: Date,
): Promise<MutationOutcome<ContestantWithWar>> {
  const guard = await loadDraftWarOwnedBy(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;
  const { war } = guard;

  const contestant = await findContestantInWar(db, warId, contestantId);
  if (!contestant) return { kind: 'notFound' };

  const attributesResult = validateOptionalAttributes(war.contestantSchema, input.attributes);
  if (!attributesResult.ok) {
    return { kind: 'validationError', errors: attributesResult.errors };
  }

  const nameError = invalidNameOutcome(input.name);
  if (nameError) return nameError;

  const updated = await updateContestant(db, contestantId, {
    name: input.name,
    bio: input.bio,
    attributes: input.attributes,
  });
  return { kind: 'ok', value: { contestant: updated, war } };
}

export async function removeContestant(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  voterId: string,
  now: Date,
): Promise<MutationOutcome<void>> {
  const guard = await loadDraftWarOwnedBy(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  const contestant = await findContestantInWar(db, warId, contestantId);
  if (!contestant) return { kind: 'notFound' };

  await deleteContestant(db, contestantId);
  return { kind: 'ok', value: undefined };
}
