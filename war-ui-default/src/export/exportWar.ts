// A creator's personal backup of a War's definition (spec §6.1 "Deletion"
// neighbours this in war-spec.md's "Export" paragraph, §10.4): title,
// contestants, and their images, so the War can be recreated later. Carries
// no votes, rankings, or win/appearance counts -- it exists to rebuild a
// War, not to report on one. Media ships as files inside the zip, never
// base64-encoded into the JSON, referenced by their in-zip path.
import { strToU8, zipSync } from 'fflate'
import type { ContestantDetail, WarDetailResponse } from '../api/client'

export type FetchBinary = (url: string) => Promise<Uint8Array>

interface ExportedMedia {
  display_order: number
  aspect_ratio: number | null
  path: string
}

interface ExportedContestant {
  name: string
  bio: string | null
  attributes: ContestantDetail['attributes']
  media: ExportedMedia[]
}

interface WarExport {
  title: string | null
  category: string | null
  visibility: string
  theme: string
  contestant_schema: unknown
  ends_at: string | null
  contestants: ExportedContestant[]
}

function largestVariant(item: ContestantDetail['media'][number]): { width: number; url: string } {
  return item.variants.reduce((largest, variant) => (variant.width > largest.width ? variant : largest))
}

function extensionFromUrl(url: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(url)
  return match ? match[1] : 'jpg'
}

async function exportContestantMedia(
  contestant: ContestantDetail,
  fetchBinary: FetchBinary,
  files: Record<string, Uint8Array>,
): Promise<ExportedMedia[]> {
  const media: ExportedMedia[] = []
  for (const item of contestant.media) {
    const variant = largestVariant(item)
    const path = `media/${contestant.id}/${item.id}.${extensionFromUrl(variant.url)}`
    files[path] = await fetchBinary(variant.url)
    media.push({ display_order: item.display_order, aspect_ratio: item.aspect_ratio, path })
  }
  return media
}

export async function buildWarExportZip(war: WarDetailResponse, fetchBinary: FetchBinary): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  const contestants: ExportedContestant[] = []

  for (const contestant of war.contestants) {
    const media = await exportContestantMedia(contestant, fetchBinary, files)
    contestants.push({ name: contestant.name, bio: contestant.bio, attributes: contestant.attributes, media })
  }

  const warExport: WarExport = {
    title: war.title,
    category: war.category,
    visibility: war.visibility,
    theme: war.theme,
    contestant_schema: war.contestant_schema,
    ends_at: war.ends_at,
    contestants,
  }

  files['war.json'] = strToU8(JSON.stringify(warExport, null, 2))
  return zipSync(files)
}
