import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { validateSchemaDefinition, type ContestantSchemaField } from '../contestants/schemaValidation.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import { generateMatchups } from '../matchups/matchupsRepository.js';
import type { Forbidden, MutationOutcome, NotActive, NotFound } from '../shared/outcomes.js';
import { effectiveStatus } from './effectiveStatus.js';
import { loadDraftWarOwnedBy, loadWarOwnedBy } from './warAccess.js';
import { isWarTheme } from './theme.js';
import {
  createMembership,
  createWar,
  findWarById,
  isMember,
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
  contestantSchema?: unknown;
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

function resolveContestantSchema(raw: unknown): { value: ContestantSchemaField[]; errors: string[] } {
  if (raw === undefined) return { value: [], errors: [] };
  const validated = validateSchemaDefinition(raw);
  return validated.ok ? { value: validated.value, errors: [] } : { value: [], errors: validated.errors };
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
  contestantSchema: ContestantSchemaField[],
  endsAt: Date | null,
) {
  return {
    creatorId: input.creatorId,
    title: input.title ?? null,
    category: input.category ?? null,
    visibility: defaults.visibility,
    mediaMode: defaults.mediaMode,
    theme: defaults.theme,
    contestantSchema,
    endsAt,
  };
}

export async function createWarForVoter(db: Kysely<Database>, input: CreateWarInput): Promise<CreateWarOutcome> {
  const defaults = resolveCreateDefaults(input);
  const schema = resolveContestantSchema(input.contestantSchema);
  const endsAt = resolveEndsAt(input.endsAt);

  const errors = collectErrors(
    optionalTitleError(input.title),
    mediaModeError(defaults.mediaMode),
    visibilityError(defaults.visibility),
    themeError(defaults.theme),
    schema.errors,
    endsAt.error,
  );
  if (errors.length > 0) {
    return { kind: 'validationError', errors };
  }

  const war = await createWar(db, buildCreateWarRecord(input, defaults, schema.value, endsAt.value));
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
  contestantSchema?: unknown;
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

function resolvePatchContestantSchema(raw: unknown): { value?: ContestantSchemaField[]; errors: string[] } {
  if (raw === undefined) return { errors: [] };
  const validated = validateSchemaDefinition(raw);
  return validated.ok ? { value: validated.value, errors: [] } : { errors: validated.errors };
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
  const guard = await loadDraftWarOwnedBy(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  const title = resolvePatchTitle(input.title);
  const visibility = resolvePatchVisibility(input.visibility);
  const theme = resolvePatchTheme(input.theme);
  const schema = resolvePatchContestantSchema(input.contestantSchema);
  const endsAt = resolvePatchEndsAt(input.endsAt);

  const errors = collectErrors(title.error, visibility.error, theme.error, schema.errors, endsAt.error);
  if (errors.length > 0) {
    return { kind: 'validationError', errors };
  }

  const patch: WarPatch = {
    title: title.value,
    category: input.category,
    visibility: visibility.value,
    theme: theme.value,
    contestantSchema: schema.value,
    endsAt: endsAt.value,
  };

  const updated = await updateWar(db, warId, patch);
  return { kind: 'ok', value: updated };
}

export type ActivateOutcome = MutationOutcome<War>;

/** draft → active: requires ≥2 contestants (spec). A contestant need not have media. */
export async function activateWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<ActivateOutcome> {
  const guard = await loadDraftWarOwnedBy(db, warId, voterId, now);
  if (guard.kind !== 'ok') return guard;

  const contestants = await listContestantsByWar(db, warId);
  if (contestants.length < 2) {
    return { kind: 'validationError', errors: ['a War needs at least 2 contestants to activate'] };
  }

  await generateMatchups(db, warId, contestants.map((c) => c.id));
  const activated = await setWarStatus(db, warId, 'active');
  return { kind: 'ok', value: activated };
}

export type CloseOutcome = MutationOutcome<War, NotFound | Forbidden | NotActive>;

export async function closeWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<CloseOutcome> {
  const guard = await loadWarOwnedBy(db, warId, voterId, now, 'active');
  if (guard.kind === 'wrongStatus') return { kind: 'notActive' };
  if (guard.kind !== 'ok') return guard;

  const closed = await setWarStatus(db, warId, 'closed');
  return { kind: 'ok', value: closed };
}

export type JoinOutcome = MutationOutcome<void, NotFound | NotActive>;

export async function joinWar(db: Kysely<Database>, warId: string, voterId: string, now: Date): Promise<JoinOutcome> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };
  if (effectiveStatus(war, now) !== 'active') return { kind: 'notActive' };

  if (!(await isMember(db, warId, voterId))) {
    await createMembership(db, warId, voterId);
  }
  return { kind: 'ok', value: undefined };
}
