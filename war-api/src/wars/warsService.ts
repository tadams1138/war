import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { listContestantsByWar, recomputeContestantCounters } from '../contestants/contestantsRepository.js';
import { validateImageUpload } from '../contestants/imageProcessing.js';
import type { ObjectStorage } from '../contestants/storage.js';
import { deleteVotesForWar } from '../votes/votesRepository.js';
import type { Forbidden, MutationOutcome, NotFound, NotPublished } from '../shared/outcomes.js';
import { effectiveStatus } from './effectiveStatus.js';
import { processShareImage } from './shareImageProcessing.js';
import { loadOwnedWar, loadWarOwnedBy } from './warAccess.js';
import { isWarTheme } from './theme.js';
import {
  createMembership,
  createWar,
  deleteWarRow,
  findWarById,
  isMember,
  setWarShareImageKey,
  setWarStatus,
  updateWar,
  type War,
  type WarPatch,
} from './warsRepository.js';

export interface CreateWarInput {
  creatorId: string;
  title?: string | null;
  category?: string | null;
  visibility?: string;
  mediaMode?: string;
  theme?: string;
  endsAt?: string | null;
}

export type CreateWarOutcome = { kind: 'created'; war: War } | { kind: 'validationError'; errors: string[] };

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
  if (typeof title !== 'string' || title.length === 0 || title.length > 256) {
    return 'title must be a non-empty string of at most 256 characters';
  }
  return null;
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
  return mediaMode === 'image' ? null : 'media_mode must be "image" in this slice';
}

function optionalTitleError(title: string | null | undefined): string | null {
  if (title === undefined || title === null) return null;
  return titleError(title);
}

function resolveCreateDefaults(input: CreateWarInput): { mediaMode: string; visibility: string; theme: string } {
  return {
    mediaMode: input.mediaMode ?? 'image',
    visibility: input.visibility ?? 'public',
    theme: input.theme ?? 'arcade',
  };
}

function resolveEndsAt(raw: string | null | undefined): { value: Date | null; error: string | null } {
  if (!raw) return { value: null, error: null };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { value: null, error: 'ends_at must be a valid date-time' };
  return { value: parsed, error: null };
}

function buildCreateWarRecord(
  input: CreateWarInput,
  defaults: { mediaMode: string; visibility: string; theme: string },
  endsAt: Date | null,
) {
  return {
    creatorId: input.creatorId,
    title: input.title ?? null,
    category: input.category ?? null,
    visibility: defaults.visibility,
    mediaMode: defaults.mediaMode,
    theme: defaults.theme,
    endsAt,
  };
}

export async function createWarForVoter(db: Kysely<Database>, input: CreateWarInput): Promise<CreateWarOutcome> {
  const defaults = resolveCreateDefaults(input);
  const endsAt = resolveEndsAt(input.endsAt);

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
  return { kind: 'created', war };
}

export type WarLookupOutcome = { kind: 'found'; war: War } | { kind: 'notFound' };

export async function getWar(db: Kysely<Database>, id: string): Promise<WarLookupOutcome> {
  const war = await findWarById(db, id);
  return war ? { kind: 'found', war } : { kind: 'notFound' };
}

export interface PatchWarInput {
  title?: string;
  category?: string | null;
  visibility?: string;
  theme?: string;
  endsAt?: string | null;
}

function resolvePatchTitle(title: string | undefined): { value?: string; error: string | null } {
  if (title === undefined) return { error: null };
  const error = titleError(title);
  return error ? { error } : { value: title, error: null };
}

function resolvePatchVisibility(visibility: string | undefined): { value?: string; error: string | null } {
  if (visibility === undefined) return { error: null };
  const error = visibilityError(visibility);
  return error ? { error } : { value: visibility, error: null };
}

function resolvePatchTheme(theme: string | undefined): { value?: string; error: string | null } {
  if (theme === undefined) return { error: null };
  const error = themeError(theme);
  return error ? { error } : { value: theme, error: null };
}

function resolvePatchEndsAt(raw: string | null | undefined): { value?: Date | null; error: string | null } {
  if (raw === undefined) return { error: null };
  if (raw === null) return { value: null, error: null };
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? { error: 'ends_at must be a valid date-time' }
    : { value: parsed, error: null };
}

export async function patchWar(
  db: Kysely<Database>,
  warId: string,
  voterId: string,
  input: PatchWarInput,
  now: Date,
): Promise<MutationOutcome<War>> {
  const guard = await loadOwnedWar(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  const title = resolvePatchTitle(input.title);
  const visibility = resolvePatchVisibility(input.visibility);
  const theme = resolvePatchTheme(input.theme);
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

export type DeleteWarOutcome = MutationOutcome<void>;

/** Any status, creator-only (spec §6.1 "Deletion") -- `loadOwnedWar` enforces ownership and existence; `deleteWarRow` cascades everything the War owns. */
export async function deleteWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<DeleteWarOutcome> {
  const guard = await loadOwnedWar(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  await deleteWarRow(db, warId);
  return { kind: 'ok', value: undefined };
}

export type PublishOutcome = MutationOutcome<War>;

/**
 * Publish/Unpublish are the two directions of one reversible toggle (spec
 * §6.1) -- not the one-way "activate" this replaces. `closed` is the one
 * true terminal state and rejects both directions; every other transition
 * is either the real state change or an idempotent no-op.
 */

/** draft → published: requires ≥2 contestants (spec). A contestant need not have media.
 *  published → published is idempotent: republishing never re-checks the
 *  contestant count, since nothing in spec revokes visibility retroactively
 *  once a War has dropped below 2 contestants through removal. */
export async function publishWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<PublishOutcome> {
  const guard = await loadOwnedWar(db, warId, voterId, now);
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

/** published → draft: requires nothing (spec) -- touches no matchup, vote, or contestant. draft → draft is idempotent. */
export async function unpublishWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<PublishOutcome> {
  const guard = await loadOwnedWar(db, warId, voterId, now);
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
 * Creator-only, always editable in any status (spec §6.1, §9.1, §10.4) --
 * a War's metadata is never status-gated. Always replaces: one deterministic
 * key per War, so a second upload overwrites the object in place rather
 * than accumulating, and the War's own row is the only place "has one" is
 * tracked.
 */
export async function setShareImage(
  db: Kysely<Database>,
  storage: ObjectStorage,
  input: SetShareImageInput,
  now: Date,
): Promise<MutationOutcome<War>> {
  const guard = await loadOwnedWar(db, input.warId, input.voterId, now);
  if (guard.kind !== 'ok') return guard;

  const validation = validateImageUpload({ mimeType: input.mimeType, sizeBytes: input.buffer.length });
  if (!validation.ok) {
    return { kind: 'validationError', errors: [validation.reason] };
  }

  const jpeg = await processShareImage(input.buffer);
  const key = `share-images/${input.warId}.jpg`;
  await storage.putPublic(key, jpeg, 'image/jpeg');
  await storage.putPrivate(`originals/share-images/${input.warId}.${input.originalExt}`, input.buffer, input.mimeType);

  const updated = await setWarShareImageKey(db, input.warId, key);
  return { kind: 'ok', value: updated };
}

export type CloseOutcome = MutationOutcome<War, NotFound | Forbidden | NotPublished>;

export async function closeWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<CloseOutcome> {
  const guard = await loadWarOwnedBy(db, warId, voterId, now, 'published');
  if (guard.kind === 'wrongStatus') return { kind: 'notPublished' };
  if (guard.kind !== 'ok') return guard;

  const closed = await setWarStatus(db, warId, 'closed');
  return { kind: 'ok', value: closed };
}

export type JoinOutcome = MutationOutcome<void, NotFound | NotPublished>;

export async function joinWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<JoinOutcome> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };
  if (effectiveStatus(war, now) !== 'published') return { kind: 'notPublished' };

  if (!(await isMember(db, warId, voterId))) {
    await createMembership(db, warId, voterId);
  }
  return { kind: 'ok', value: undefined };
}

/**
 * Deletes every vote cast in the War and resets every contestant's counters
 * to zero (spec §6.1 "Clear Votes") -- any status, creator-only, no other
 * precondition. A hard delete: this is a deliberate, user-confirmed reset,
 * not a bug. Membership rows are untouched. Runs in one transaction so a
 * failure between the delete and the recompute never leaves counters
 * inconsistent with an emptied `votes` table.
 */
export async function clearVotes(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<MutationOutcome<War>> {
  const guard = await loadOwnedWar(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  await db.transaction().execute(async (trx) => {
    await deleteVotesForWar(trx, warId);
    await recomputeContestantCounters(trx, warId);
  });

  return { kind: 'ok', value: guard.war };
}
