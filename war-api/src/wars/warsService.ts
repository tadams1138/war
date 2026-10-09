import type { FastifyBaseLogger } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { listContestantsByWar, recomputeContestantCounters } from '../contestants/contestantsRepository.js';
import { validateImageUpload } from '../contestants/imageProcessing.js';
import type { ObjectStorage } from '../contestants/storage.js';
import { deleteVotesForWar } from '../votes/votesRepository.js';
import { nonEmptyStringError, validateIfPresent } from '../shared/bodyValidation.js';
import type { MutationOutcome, NotFound, NotPublished, ValidationError } from '../shared/outcomes.js';
import { effectiveStatus } from './effectiveStatus.js';
import { processShareImage } from './shareImageProcessing.js';
import { loadOwnedWar } from './warAccess.js';
import { deleteMediaObjects, mediaPrefixes } from './warMediaStorage.js';
import { isWarTheme } from './theme.js';
import {
  createMembership,
  createWar,
  deleteWarRowIn,
  findWarById,
  setWarShareImageKey,
  setWarStatus,
  updateWar,
  type War,
  type WarPatch,
} from './warsRepository.js';

const MAX_TITLE_LENGTH = 256;
const INVALID_END_DATE = 'ends_at must be a valid date-time';

export interface CreateWarInput {
  creatorId: string;
  title?: string | null;
  category?: string | null;
  visibility?: string;
  mediaMode?: string;
  theme?: string;
  endsAt?: string | null;
}

export type CreateWarOutcome = MutationOutcome<War, ValidationError>;

/** Flattens a mix of single errors and error-arrays (a group's own validator may report more than one) into one list, dropping absent ones. */
function collectErrors(...groups: (string | null | string[])[]): string[] {
  const errors: string[] = [];
  for (const group of groups) {
    if (group === null) continue;
    if (Array.isArray(group)) errors.push(...group);
    else errors.push(group);
  }
  return errors;
}

function titleError(title: unknown): string | null {
  return nonEmptyStringError('title', title, MAX_TITLE_LENGTH);
}

function visibilityError(visibility: unknown): string | null {
  if (visibility !== 'public' && visibility !== 'invite_only') {
    return 'visibility must be "public" or "invite_only"';
  }
  return null;
}

function themeError(theme: unknown): string | null {
  if (!isWarTheme(theme)) return 'theme must be "arcade", "fight_card", or "scrapbook"';
  return null;
}

function mediaModeError(mediaMode: string): string | null {
  return mediaMode === 'image' ? null : 'media_mode must be "image"';
}

function optionalTitleError(title: string | null | undefined): string | null {
  if (title === undefined || title === null) return null;
  return titleError(title);
}

function parseEndsAt(raw: string): { value?: Date; error: string | null } {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? { error: INVALID_END_DATE } : { value: parsed, error: null };
}

function resolveCreateDefaults(input: CreateWarInput): { mediaMode: string; visibility: string; theme: string } {
  return {
    mediaMode: input.mediaMode ?? 'image',
    visibility: input.visibility ?? 'public',
    theme: input.theme ?? 'arcade',
  };
}

/** A blank `ends_at` means "no end date"; only a non-blank one is parsed. */
function resolveCreateEndsAt(raw: string | null | undefined): { value?: Date; error: string | null } {
  return raw ? parseEndsAt(raw) : { error: null };
}

function buildCreateWarRecord(input: CreateWarInput, defaults: { mediaMode: string; visibility: string; theme: string }, endsAt: Date | undefined) {
  return {
    creatorId: input.creatorId,
    title: input.title ?? null,
    category: input.category ?? null,
    visibility: defaults.visibility,
    mediaMode: defaults.mediaMode,
    theme: defaults.theme,
    endsAt: endsAt ?? null,
  };
}

export async function createWarForVoter(db: Kysely<Database>, input: CreateWarInput): Promise<CreateWarOutcome> {
  const defaults = resolveCreateDefaults(input);
  const endsAt = resolveCreateEndsAt(input.endsAt);

  const errors = collectErrors(
    optionalTitleError(input.title),
    mediaModeError(defaults.mediaMode),
    visibilityError(defaults.visibility),
    themeError(defaults.theme),
    endsAt.error,
  );
  if (errors.length > 0) {
    return { kind: 'validationError', errors };
  }

  const war = await createWar(db, buildCreateWarRecord(input, defaults, endsAt.value));
  return { kind: 'ok', value: war };
}

export interface PatchWarInput {
  title?: string;
  category?: string | null;
  visibility?: string;
  theme?: string;
  endsAt?: string | null;
}

/** `ends_at` is the one patchable field that may be cleared: `null` removes the end date, `undefined` leaves it alone. */
function resolvePatchEndsAt(raw: string | null | undefined): { value?: Date | null; error: string | null } {
  if (raw === undefined) return { error: null };
  if (raw === null) return { value: null, error: null };
  return parseEndsAt(raw);
}

export async function patchWar(db: Kysely<Database>, warId: string, voterId: string, input: PatchWarInput): Promise<MutationOutcome<War>> {
  const guard = await loadOwnedWar(db, warId, voterId);
  if (guard.kind !== 'ok') return guard;

  const title = validateIfPresent(input.title, titleError);
  const visibility = validateIfPresent(input.visibility, visibilityError);
  const theme = validateIfPresent(input.theme, themeError);
  const endsAt = resolvePatchEndsAt(input.endsAt);

  const errors = collectErrors(title.error, visibility.error, theme.error, endsAt.error);
  if (errors.length > 0) {
    return { kind: 'validationError', errors };
  }

  const patch: WarPatch = {
    title: title.value,
    category: input.category,
    visibility: visibility.value,
    theme: theme.value,
    endsAt: endsAt.value,
  };

  const updated = await updateWar(db, warId, patch);
  return { kind: 'ok', value: updated };
}

/**
 * Any status, creator-only (§6.1 "Deletion"). `deleteWarRowIn` cascades everything the War owns in one
 * transaction; its media objects are deleted best effort after that commit (a storage failure is logged and the
 * delete still succeeds), like Remove a War and Ban.
 */
export async function deleteWar(
  db: Kysely<Database>,
  storage: ObjectStorage,
  log: FastifyBaseLogger,
  warId: string,
  voterId: string,
): Promise<MutationOutcome<void>> {
  const guard = await loadOwnedWar(db, warId, voterId);
  if (guard.kind !== 'ok') return guard;

  const prefixes = await db.transaction().execute(async (trx) => {
    const contestantIds = (await listContestantsByWar(trx, warId)).map((contestant) => contestant.id);
    await deleteWarRowIn(trx, warId);
    return mediaPrefixes(warId, contestantIds);
  });
  await deleteMediaObjects(storage, log, prefixes, { warId });
  return { kind: 'ok', value: undefined };
}

/**
 * Publish and Unpublish are the two directions of one reversible toggle (§6.1). `closed` is the one
 * terminal state and rejects both; every other transition is either the real change or an idempotent no-op.
 *
 * draft → published requires at least 2 contestants. Republishing never re-checks the count, since nothing
 * revokes visibility retroactively once a published War drops below 2 contestants.
 */
export async function publishWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<MutationOutcome<War>> {
  const guard = await loadOwnedWar(db, warId, voterId);
  if (guard.kind !== 'ok') return guard;
  const { war } = guard;

  const status = effectiveStatus(war, now);
  if (status === 'closed') {
    return { kind: 'validationError', errors: ['a closed War cannot be published'] };
  }
  if (status === 'published') {
    return { kind: 'ok', value: war };
  }

  const contestants = await listContestantsByWar(db, warId);
  if (contestants.length < 2) {
    return { kind: 'validationError', errors: ['a War needs at least 2 contestants to publish'] };
  }

  const published = await setWarStatus(db, warId, 'published');
  return { kind: 'ok', value: published };
}

/** published → draft requires nothing and touches no matchup, vote or contestant; draft → draft is idempotent. */
export async function unpublishWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<MutationOutcome<War>> {
  const guard = await loadOwnedWar(db, warId, voterId);
  if (guard.kind !== 'ok') return guard;
  const { war } = guard;

  const status = effectiveStatus(war, now);
  if (status === 'closed') {
    return { kind: 'validationError', errors: ['a closed War cannot be unpublished'] };
  }
  if (status === 'draft') {
    return { kind: 'ok', value: war };
  }

  const unpublished = await setWarStatus(db, warId, 'draft');
  return { kind: 'ok', value: unpublished };
}

export interface SetShareImageInput {
  warId: string;
  voterId: string;
  buffer: Buffer;
  mimeType: string;
  originalExt: string;
}

/**
 * Creator-only, any status (§6.1, §9.1, §10.4). Always replaces: one deterministic key per War, so a
 * second upload overwrites the object in place and the War's own row is the only record of "has one".
 */
export async function setShareImage(db: Kysely<Database>, storage: ObjectStorage, input: SetShareImageInput): Promise<MutationOutcome<War>> {
  const guard = await loadOwnedWar(db, input.warId, input.voterId);
  if (guard.kind !== 'ok') return guard;

  const validation = validateImageUpload({ mimeType: input.mimeType, sizeBytes: input.buffer.length });
  if (validation.kind !== 'ok') {
    return { kind: 'validationError', errors: [validation.reason] };
  }

  const jpeg = await processShareImage(input.buffer);
  const key = `share-images/${input.warId}.jpg`;
  await storage.putPublic(key, jpeg, 'image/jpeg');
  await storage.putPrivate(`originals/share-images/${input.warId}.${input.originalExt}`, input.buffer, input.mimeType);

  const updated = await setWarShareImageKey(db, input.warId, key);
  return { kind: 'ok', value: updated };
}

export async function joinWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<MutationOutcome<void, NotFound | NotPublished>> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };
  if (effectiveStatus(war, now) !== 'published') return { kind: 'notPublished' };

  await createMembership(db, warId, voterId);
  return { kind: 'ok', value: undefined };
}

/**
 * Deletes every vote cast in the War and resets every contestant's counters to zero (§6.1 "Clear Votes"):
 * any status, creator-only, a deliberate hard delete. Membership rows are untouched. One transaction, so a failure
 * between the delete and the recompute never leaves counters inconsistent with an emptied `votes` table.
 */
export async function clearVotes(db: Kysely<Database>, warId: string, voterId: string): Promise<MutationOutcome<War>> {
  const guard = await loadOwnedWar(db, warId, voterId);
  if (guard.kind !== 'ok') return guard;

  await db.transaction().execute(async (trx) => {
    await deleteVotesForWar(trx, warId);
    await recomputeContestantCounters(trx, warId);
  });

  return { kind: 'ok', value: guard.war };
}
