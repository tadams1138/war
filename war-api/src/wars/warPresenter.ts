import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import { listMediaByContestants } from '../contestants/contestantMediaRepository.js';
import { presentContestant, type ContestantDetailView } from '../contestants/contestantPresenter.js';
import { effectiveStatus } from './effectiveStatus.js';
import type { War } from './warsRepository.js';
import { THEMES } from './theme.js';

export interface WarSummaryView {
  id: string;
  title: string | null;
  category: string | null;
  status: string;
  visibility: string;
  media_mode: string;
  theme: string;
  ends_at: string | null;
  contestant_count: number;
  share_image_url: string | null;
  creator_name: string | null;
}

/**
 * Properties shared by {@link WarSummaryView}'s schema and
 * {@link WarDetailView}'s (which is a `WarSummary` plus `contestants`).
 * Kept as a standalone map, not a schema, so `warDetailResponseSchema` can
 * build a single flat response schema instead of relying on `allOf`
 * merging. Kept beside the interfaces they mirror -- see `mediaItemSchema`
 * (`../contestants/mediaPresenter.ts`) for why.
 */
export const warSummaryProperties = {
  id: { type: 'string', format: 'uuid' },
  title: { type: ['string', 'null'] },
  category: { type: ['string', 'null'] },
  status: { type: 'string', enum: ['draft', 'published', 'closed'] },
  visibility: { type: 'string', enum: ['public', 'invite_only'] },
  media_mode: { type: 'string', enum: ['image'] },
  theme: { type: 'string', enum: [...THEMES] },
  ends_at: { type: ['string', 'null'], format: 'date-time' },
  contestant_count: { type: 'integer', minimum: 0 },
  share_image_url: { type: ['string', 'null'], format: 'uri' },
  creator_name: { type: ['string', 'null'] },
};

const warSummaryRequired = [
  'id',
  'title',
  'category',
  'status',
  'visibility',
  'media_mode',
  'theme',
  'ends_at',
  'contestant_count',
  'share_image_url',
  'creator_name',
];

/** The response body JSON Schema for {@link WarSummaryView} (spec). Registered under `$id: "WarSummary"`. */
export const warSummarySchema = {
  $id: 'WarSummary',
  type: 'object',
  required: warSummaryRequired,
  properties: warSummaryProperties,
};

/**
 * The response body JSON Schema for {@link WarDetailView} (spec):
 * `warSummaryProperties` plus a required `contestants` array. Not
 * registered under a shared `$id` -- only `GET /wars/:id` uses it.
 */
export const warDetailResponseSchema = {
  type: 'object',
  required: [...warSummaryRequired, 'contestants', 'is_owner'],
  properties: {
    ...warSummaryProperties,
    contestants: { type: 'array', items: { $ref: 'ContestantDetail#' } },
    is_owner: { type: 'boolean' },
  },
};

export function presentWarSummary(
  war: War,
  now: Date,
  contestantCount: number,
  publicBaseUrl: string,
  creatorName: string | null,
): WarSummaryView {
  return {
    id: war.id,
    title: war.title,
    category: war.category,
    status: effectiveStatus(war, now),
    visibility: war.visibility,
    media_mode: war.mediaMode,
    theme: war.theme,
    ends_at: war.endsAt ? war.endsAt.toISOString() : null,
    contestant_count: contestantCount,
    share_image_url: war.shareImageKey ? `${publicBaseUrl}/${war.shareImageKey}` : null,
    creator_name: creatorName,
  };
}

export interface WarDetailView extends WarSummaryView {
  contestants: ContestantDetailView[];
  is_owner: boolean;
}

export async function presentWarDetail(
  db: Kysely<Database>,
  war: War,
  now: Date,
  publicBaseUrl: string,
  voterId: string | undefined,
): Promise<WarDetailView> {
  const contestants = await listContestantsByWar(db, war.id);
  const mediaByContestant = await listMediaByContestants(
    db,
    contestants.map((c) => c.id),
  );
  const views = contestants.map((c) => presentContestant(c, war, mediaByContestant.get(c.id) ?? [], publicBaseUrl));
  return {
    ...presentWarSummary(war, now, contestants.length, publicBaseUrl, null),
    contestants: views,
    is_owner: war.creatorId === voterId,
  };
}
