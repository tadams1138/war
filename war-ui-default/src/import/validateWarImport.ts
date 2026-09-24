// The inverse of exportWar.ts's buildWarExportZip: raw zip bytes in (as a
// file picker hands over), a validated War shape out. Validates the whole
// file up front (spec §10.4, "Import") -- a malformed file is rejected with
// one clear message and nothing is ever sent to the server from here.
import { strFromU8, unzipSync } from 'fflate'

export interface ValidatedMedia {
  display_order: number
  aspect_ratio: number | null
  path: string
}

export interface ValidatedContestant {
  name: string
  bio: string | null
  media: ValidatedMedia[]
}

export interface ValidatedWarImport {
  metadata: {
    title: string | null
    category: string | null
    visibility: string
    theme: string
    ends_at: string | null
  }
  contestants: ValidatedContestant[]
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

function isValidMedia(value: unknown): value is ValidatedMedia {
  if (typeof value !== 'object' || value === null) return false
  const media = value as Record<string, unknown>
  return typeof media.display_order === 'number' && typeof media.path === 'string'
}

function isValidContestant(value: unknown): value is ValidatedContestant {
  if (typeof value !== 'object' || value === null) return false
  const contestant = value as Record<string, unknown>
  const checks = [
    typeof contestant.name === 'string',
    isNullableString(contestant.bio),
    Array.isArray(contestant.media) && contestant.media.every(isValidMedia),
  ]
  return checks.every(Boolean)
}

function isValidMetadata(value: unknown): value is ValidatedWarImport['metadata'] {
  if (typeof value !== 'object' || value === null) return false
  const metadata = value as Record<string, unknown>
  const checks = [
    isNullableString(metadata.title),
    isNullableString(metadata.category),
    typeof metadata.visibility === 'string',
    typeof metadata.theme === 'string',
    isNullableString(metadata.ends_at),
  ]
  return checks.every(Boolean)
}

function parseWarJson(raw: string): ParsedWarJson {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail("This file isn't a valid War export — its data couldn't be read.")
  }
  if (!isValidMetadata(parsed) || !Array.isArray((parsed as Record<string, unknown>).contestants)) {
    return fail("This file isn't a valid War export — it's missing required data.")
  }
  const contestants = (parsed as Record<string, unknown>).contestants as unknown[]
  if (!contestants.every(isValidContestant)) {
    return fail("This file isn't a valid War export — it's missing required data.")
  }
  const metadata = parsed as ValidatedWarImport['metadata']
  return {
    ok: true,
    data: { metadata, contestants: contestants as ValidatedContestant[] },
  }
}

function missingMediaPath(contestants: ValidatedContestant[], files: Record<string, Uint8Array>): string | null {
  for (const contestant of contestants) {
    for (const media of contestant.media) {
      if (!(media.path in files)) return media.path
    }
  }
  return null
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

  const missingPath = missingMediaPath(parsed.data.contestants, files)
  if (missingPath) {
    return fail("This file isn't a valid War export — it's missing an image it references.")
  }

  return { ok: true, data: parsed.data, files }
}
