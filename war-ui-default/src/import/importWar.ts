// Recreates a War from a validated import (spec §10.4, "Import"): creates
// the War, then each contestant, then each contestant's images, entirely
// through the same endpoints EditWar's own UI already calls -- no dedicated
// import endpoint exists or is needed. The API calls are injected so this
// orchestration is testable without a network, mirroring exportWar.ts's
// injected `fetchBinary`.
import { toUserMessage } from '../api/errors'
import type { ValidatedContestant, ValidatedWarImport } from './validateWarImport'

export interface CreatedWar {
  id: string
}

export interface CreatedContestant {
  id: string
}

export interface ImportApi {
  createWar: (payload: {
    title: string | null
    category: string | null
    visibility: string
    theme: string
    ends_at: string | null
    contestant_schema: unknown
  }) => Promise<CreatedWar>
  addContestant: (warId: string, payload: { name: string; bio: string | null; attributes: unknown[] }) => Promise<CreatedContestant>
  uploadImage: (warId: string, contestantId: string, file: File) => Promise<void>
}

export interface ImportResult {
  warId: string | null
  error: string | null
}

function fileNameFor(path: string): string {
  return path.split('/').pop() ?? path
}

// Mirrors war-api's own extension<->MIME mapping (contestants/imageProcessing.ts,
// ALLOWED_MIME_TYPES) so a re-imported file passes the server's upload validation --
// `new File(...)` never infers `type` from a filename on its own.
const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function mimeTypeFor(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase()
  return ext ? MIME_TYPE_BY_EXTENSION[ext] : undefined
}

async function importContestant(
  warId: string,
  contestant: ValidatedContestant,
  files: Record<string, Uint8Array>,
  api: ImportApi,
): Promise<void> {
  const created = await api.addContestant(warId, { name: contestant.name, bio: contestant.bio, attributes: contestant.attributes })
  for (const media of contestant.media) {
    const bytes = files[media.path]
    const file = new File([bytes as Uint8Array<ArrayBuffer>], fileNameFor(media.path), { type: mimeTypeFor(media.path) })
    await api.uploadImage(warId, created.id, file)
  }
}

export async function importWar(validated: ValidatedWarImport, files: Record<string, Uint8Array>, api: ImportApi): Promise<ImportResult> {
  let warId: string
  try {
    const war = await api.createWar(validated.metadata)
    warId = war.id
  } catch (error) {
    return { warId: null, error: toUserMessage(error) }
  }

  try {
    for (const contestant of validated.contestants) {
      await importContestant(warId, contestant, files, api)
    }
  } catch (error) {
    return { warId, error: toUserMessage(error) }
  }

  return { warId, error: null }
}
