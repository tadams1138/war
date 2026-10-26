// The inverse of exportWar.ts's buildWarExportZip: raw zip bytes in (as a
// file picker hands over), a validated War shape out. Validates the whole
// file up front (spec §10.4, "Import") -- a malformed file is rejected with
// one clear message and nothing is ever sent to the server from here.
import { strFromU8, unzipSync } from 'fflate'
import type { WarExportContestant, WarExportMedia, WarExportMetadata } from '../export/warExportFile'

export interface ValidatedWarImport {
  metadata: WarExportMetadata
  contestants: WarExportContestant[]
}

export type WarImportValidation =
  | { ok: true; data: ValidatedWarImport; files: Record<string, Uint8Array> }
  | { ok: false; error: string }

type ParsedWarJson = { ok: true; data: ValidatedWarImport } | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isValidMedia(value: unknown): value is WarExportMedia {
  if (typeof value !== 'object' || value === null) return false
  const media = value as Record<string, unknown>
  if (media.kind === 'video') return isValidVideo(media)
  return typeof media.display_order === 'number' && typeof media.path === 'string'
}

function isValidVideo(media: Record<string, unknown>): boolean {
  const checks = [
    isVideoProvider(media.provider),
    isVideoId(media.provider, media.video_id),
    isNonnegativeInteger(media.start_seconds),
    isValidVideoEnd(media.end_seconds, media.start_seconds),
  ]
  return checks.every(Boolean)
}

function isVideoProvider(value: unknown): boolean {
  return value === 'youtube' || value === 'vimeo'
}

function isVideoId(provider: unknown, id: unknown): boolean {
  if (typeof id !== 'string') return false
  return provider === 'vimeo' ? /^\d+$/.test(id) : /^[A-Za-z0-9_-]{11}$/.test(id)
}

function isNonnegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isValidVideoEnd(end: unknown, start: unknown): boolean {
  if (end === null) return true
  return typeof end === 'number' && Number.isInteger(end) && end > Number(start) && end - Number(start) <= 60
}

function isMediaMode(value: unknown): boolean {
  return value === undefined || value === 'image' || value === 'video'
}

function isValidContestant(value: unknown): value is WarExportContestant {
  if (typeof value !== 'object' || value === null) return false
  const contestant = value as Record<string, unknown>
  const checks = [
    typeof contestant.name === 'string',
    isNullableString(contestant.bio),
    Array.isArray(contestant.media) && contestant.media.every(isValidMedia),
  ]
  return checks.every(Boolean)
}

function isValidMetadata(value: unknown): value is WarExportMetadata {
  if (typeof value !== 'object' || value === null) return false
  const metadata = value as Record<string, unknown>
  const checks = [
    isNullableString(metadata.title),
    isNullableString(metadata.category),
    typeof metadata.visibility === 'string',
    typeof metadata.theme === 'string',
    isNullableString(metadata.ends_at),
    // Absent (older exports predating this field) is treated as null below.
    metadata.share_image === undefined || isNullableString(metadata.share_image),
    isMediaMode(metadata.media_mode),
  ]
  return checks.every(Boolean)
}

function mediaMatchesMode(contestants: WarExportContestant[], mode: 'image' | 'video'): boolean {
  return contestants.every((contestant) => contestantMediaMatchesMode(contestant, mode))
}

function contestantMediaMatchesMode(contestant: WarExportContestant, mode: 'image' | 'video'): boolean {
  if (mode === 'video') return contestant.media.length <= 1 && contestant.media.every((media) => media.kind === 'video')
  return contestant.media.every((media) => media.kind !== 'video')
}

function normalizedMetadata(parsed: WarExportMetadata): WarExportMetadata {
  return { ...parsed, media_mode: parsed.media_mode ?? 'image', share_image: defaultShareImage(parsed.share_image) }
}

function parseWarJson(raw: string): ParsedWarJson {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail("This file isn't a valid War export — its data couldn't be read.")
  }
  return parseParsedWar(parsed)
}

function parseParsedWar(parsed: unknown): ParsedWarJson {
  if (!isValidMetadata(parsed) || !Array.isArray((parsed as Record<string, unknown>).contestants)) {
    return fail("This file isn't a valid War export — it's missing required data.")
  }
  const contestants = (parsed as Record<string, unknown>).contestants as unknown[]
  if (!contestants.every(isValidContestant)) {
    return fail("This file isn't a valid War export — it's missing required data.")
  }
  const metadata = normalizedMetadata(parsed)
  if (!mediaMatchesMode(contestants as WarExportContestant[], metadata.media_mode!)) {
    return fail("This file isn't a valid War export — its media does not match its mode.")
  }
  return {
    ok: true,
    data: { metadata, contestants: contestants as WarExportContestant[] },
  }
}

function missingMediaPath(contestants: WarExportContestant[], files: Record<string, Uint8Array>): string | null {
  for (const contestant of contestants) {
    for (const media of contestant.media) {
      if (media.kind === 'video') continue
      if (!(media.path in files)) return media.path
    }
  }
  return null
}

function missingShareImagePath(shareImage: string | null, files: Record<string, Uint8Array>): boolean {
  return shareImage !== null && !(shareImage in files)
}

function isMissingReferencedImage(data: ValidatedWarImport, files: Record<string, Uint8Array>): boolean {
  return missingMediaPath(data.contestants, files) !== null || missingShareImagePath(data.metadata.share_image, files)
}

function defaultShareImage(value: string | null | undefined): string | null {
  return value ?? null
}

export function validateWarImport(zipBytes: Uint8Array): WarImportValidation {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(zipBytes)
  } catch {
    return fail("This file isn't a valid War export — it's not a zip file we can read.")
  }

  const warJson = files['war.json']
  if (!warJson) {
    return fail("This file isn't a valid War export — it's missing war.json.")
  }

  const parsed = parseWarJson(strFromU8(warJson))
  if (!parsed.ok) return parsed

  if (isMissingReferencedImage(parsed.data, files)) {
    return fail("This file isn't a valid War export — it's missing an image it references.")
  }

  return { ok: true, data: parsed.data, files }
}
