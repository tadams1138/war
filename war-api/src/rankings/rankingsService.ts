import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import { listMediaByContestants } from '../contestants/contestantMediaRepository.js';
import { presentMedia } from '../contestants/mediaPresenter.js';
import { contestantViewSchema, type ContestantView } from '../contestants/contestantPresenter.js';
import { effectiveStatus } from '../wars/effectiveStatus.js';
import { isWarVisibleTo } from '../wars/warAccess.js';
import { findWarById, isMember } from '../wars/warsRepository.js';
import { THEMES } from '../wars/theme.js';
import { rankContestants } from './scoring.js';

export interface RankingEntry {
  rank: number | null;
  contestant: ContestantView;
  wins: number;
  appearances: number;
}

export interface RankingsView {
  war_id: string;
  status: string;
  theme: string;
  updated_at: string;
  rankings: RankingEntry[];
}

/**
 * The response body JSON Schema for {@link RankingsView} (spec,
 * "Addendum (2026-08-31)"). Kept beside the interface it mirrors -- see
 * `mediaItemSchema` (`../contestants/mediaPresenter.ts`) for why. `rank` is
 * `["integer", "null"]` since an unranked (zero-appearance) contestant is
 * listed with `rank: null` (spec).
 */
export const rankingsResponseSchema = {
  type: 'object',
  required: ['war_id', 'status', 'theme', 'updated_at', 'rankings'],
  properties: {
    war_id: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['draft', 'published', 'closed'] },
    theme: { type: 'string', enum: [...THEMES] },
    updated_at: { type: 'string', format: 'date-time' },
    rankings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['rank', 'contestant', 'wins', 'appearances'],
        properties: {
          rank: { type: ['integer', 'null'] },
          contestant: contestantViewSchema,
          wins: { type: 'integer' },
          appearances: { type: 'integer' },
        },
      },
    },
  },
};

export type RankingsOutcome =
  | { kind: 'ok'; view: RankingsView; visibility: string }
  | { kind: 'notFound' }
  | { kind: 'unauthorized' };

/** Extracted from `rankingsFor` purely to keep that function's own branch count down. */
async function isUnauthorizedForRankings(
  db: Kysely<Database>,
  war: { id: string; creatorId: string | null; visibility: string },
  viewerId: string | null,
): Promise<boolean> {
  if (war.visibility !== 'invite_only') return false;
  if (viewerId === null) return true;
  return war.creatorId !== viewerId && !(await isMember(db, war.id, viewerId));
}

/**
 * Assembles a War's rankings response (spec): the invite-only membership
 * check, scoring, and view assembly all live here rather than in the route
 * handler, matching the routes → service → repository → presenter layering
 * every other domain in this slice follows (design review finding 8).
 * `viewerId` is `null` for an anonymous request — JWT extraction stays a
 * route concern.
 */
export async function rankingsFor(
  db: Kysely<Database>,
  warId: string,
  viewerId: string | null,
  now: Date,
  publicBaseUrl: string,
): Promise<RankingsOutcome> {
  const war = await findWarById(db, warId);
  if (!war) {
    return { kind: 'notFound' };
  }
  // A War not currently published is invisible to anyone but its creator
  // (spec §6.1) -- rankings report it as not found, identically to an
  // actually-missing War.
  if (!isWarVisibleTo(war, now, viewerId)) {
    return { kind: 'notFound' };
  }

  if (await isUnauthorizedForRankings(db, war, viewerId)) {
    return { kind: 'unauthorized' };
  }

  const contestants = await listContestantsByWar(db, war.id);
  const ranked = rankContestants(
    contestants.map((c) => ({ id: c.id, name: c.name, winCount: c.winCount, appearanceCount: c.appearanceCount })),
  );

  const mediaByContestant = await listMediaByContestants(
    db,
    ranked.map((entry) => entry.contestant.id),
  );

  const rankings: RankingEntry[] = ranked.map((entry) => ({
    rank: entry.rank,
    contestant: {
      id: entry.contestant.id,
      name: entry.contestant.name,
      media: presentMedia(mediaByContestant.get(entry.contestant.id) ?? [], publicBaseUrl),
    },
    wins: entry.contestant.winCount,
    appearances: entry.contestant.appearanceCount,
  }));

  return {
    kind: 'ok',
    visibility: war.visibility,
    view: {
      war_id: war.id,
      status: effectiveStatus(war, now),
      theme: war.theme,
      updated_at: now.toISOString(),
      rankings,
    },
  };
}
