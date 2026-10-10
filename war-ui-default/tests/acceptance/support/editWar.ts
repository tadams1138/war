// A War as its creator sees it (GET /wars/:id), queued by "a draft War" and
// edited in place by the Givens that follow, before the app boots. Contestants
// and their images are identified by name and position, so a step can name
// them ("Ada", "the first image") without the scenario knowing any id.
import type { ContestantDetail, MediaItem, WarDetailResponse } from '../../../src/api/client'
import { buildContestant, buildMediaItem } from '../../../src/mocks/fixtures'
import type { World } from '../steps/fixtures'
import { recipeFor } from './staffRecords'

export const contestantIdOf = (warId: string, name: string) => `${warId}-${name.toLowerCase().replace(/\W+/g, '-')}`
export const imageIdOf = (contestantId: string, position: number) => `${contestantId}-image-${position}`

// The images are numbered from 1 and ordered as numbered.
export function imagesOf(contestantId: string, count: number): MediaItem[] {
  return Array.from({ length: count }, (_, index) => buildMediaItem({ id: imageIdOf(contestantId, index + 1), display_order: index }))
}

// A contestant's columns in a table row: "bio", "images" (a count, one by
// default) and "votes" (those cast on its matchups, none by default).
export function contestantFrom(warId: string, row: Record<string, string>): ContestantDetail {
  const id = contestantIdOf(warId, row.name!)
  return buildContestant({
    id,
    name: row.name,
    bio: row.bio || null,
    media: imagesOf(id, Number(row.images || 1)),
    appearance_count: Number(row.votes || 0),
  })
}

export const warDetail = (world: World): WarDetailResponse => recipeFor(world, `/wars/${world.warId}`).responses[0]!.body as WarDetailResponse

export function contestantNamed(war: WarDetailResponse, name: string): ContestantDetail {
  const found = war.contestants.find((contestant) => contestant.name === name)
  if (!found) throw new Error(`Give the contestant "${name}" first`)
  return found
}

// The War with one contestant's fields replaced.
export function withContestant(war: WarDetailResponse, name: string, update: (contestant: ContestantDetail) => Partial<ContestantDetail>) {
  return { contestants: war.contestants.map((contestant) => (contestant.name === name ? { ...contestant, ...update(contestant) } : contestant)) }
}
