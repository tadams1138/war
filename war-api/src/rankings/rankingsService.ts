import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import { listMediaByContestants } from '../contestants/contestantMediaRepository.js';
import { presentMedia } from '../contestants/mediaPresenter.js';
import { contestantViewSchema, type ContestantView } from '../contestants/contestantPresenter.js';
import { effectiveStatus } from '../wars/effectiveStatus.js';
import { findWarById, isMember } from '../wars/warsRepository.js';
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
  updated_at: string;
  rankings: RankingEntry[];
}

/**
 * The response body JSON Schema for {@link RankingsView} (spec §11.2.1,
 * "Addendum (2026-08-31)"). Kept beside the interface it mirrors -- see
 * `mediaItemSchema` (`../contestants/mediaPresenter.ts`) for why. `rank` is
 * `["integer", "null"]` since an unranked (zero-appearance) contestant is
 * listed with `rank: null` (spec §8).
 */
export const rankingsResponseSchema = {
  type: 'object',
  required: ['war_id', 'status', 'updated_at', 'rankings'],
  properties: {
    war_id: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['draft', 'active', 'closed'] },
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

/**
 * Assembles a War's rankings response (spec §9): the invite-only membership
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

  if (war.visibility === 'invite_only') {
    if (viewerId === null) {
      return { kind: 'unauthorized' };
    }
    if (war.creatorId !== viewerId && !(await isMember(db, war.id, viewerId))) {
      return { kind: 'unauthorized' };
    }
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
      updated_at: now.toISOString(),
      rankings,
    },
  };
}
