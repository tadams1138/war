// A creator's personal backup of a War's definition (war-spec.md §10.4): title,
// contestants, and their images, so the War can be recreated later. Carries
// no votes, rankings, or win/appearance counts -- it exists to rebuild a
// War, not to report on one. Media ships as files inside the zip, never
// base64-encoded into the JSON, referenced by their in-zip path.
import { strToU8, zipSync } from 'fflate'
import type { ContestantDetail, WarDetailResponse } from '../api/client'
import { largestVariant } from '../utils/media'
import type { WarExportContestant, WarExportFile, WarExportMedia } from './warExportFile'

export type FetchBinary = (url: string) => Promise<Uint8Array>

function extensionFromUrl(url: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(url)
  return match ? match[1] : 'jpg'
}

async function exportContestantMedia(
  contestant: ContestantDetail,
  fetchBinary: FetchBinary,
  files: Record<string, Uint8Array>,
): Promise<WarExportMedia[]> {
  const media: WarExportMedia[] = []
  for (const item of contestant.media) {
    const variant = largestVariant(item)
    const path = `media/${contestant.id}/${item.id}.${extensionFromUrl(variant.url)}`
    files[path] = await fetchBinary(variant.url)
    media.push({ display_order: item.display_order, aspect_ratio: item.aspect_ratio, path })
  }
  return media
}

async function exportShareImage(
  shareImageUrl: string | null,
  fetchBinary: FetchBinary,
  files: Record<string, Uint8Array>,
): Promise<string | null> {
  if (!shareImageUrl) return null
  const path = `share-image.${extensionFromUrl(shareImageUrl)}`
  files[path] = await fetchBinary(shareImageUrl)
  return path
}

export async function buildWarExportZip(war: WarDetailResponse, fetchBinary: FetchBinary): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  const contestants: WarExportContestant[] = []

  for (const contestant of war.contestants) {
    const media = await exportContestantMedia(contestant, fetchBinary, files)
    contestants.push({ name: contestant.name, bio: contestant.bio, media })
  }

  const warExport: WarExportFile = {
    title: war.title,
    category: war.category,
    visibility: war.visibility,
    theme: war.theme,
    ends_at: war.ends_at,
    share_image: await exportShareImage(war.share_image_url, fetchBinary, files),
    contestants,
  }

  files['war.json'] = strToU8(JSON.stringify(warExport, null, 2))
  return zipSync(files)
}
