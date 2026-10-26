// Recreates a War from a validated import (spec §10.4, "Import"): creates
// the War, then each contestant, then each contestant's images, entirely
// through the same endpoints EditWar's own UI already calls -- no dedicated
// import endpoint exists or is needed. The API calls are injected so this
// orchestration is testable without a network, mirroring exportWar.ts's
// injected `fetchBinary`.
import { toUserMessage } from '../api/errors'
import type { WarExportContestant, WarExportVideoMedia } from '../export/warExportFile'
import type { ValidatedWarImport } from './validateWarImport'

interface CreatedWar {
  id: string
}

interface CreatedContestant {
  id: string
}

export interface ImportApi {
  createWar: (payload: {
    title: string | null
    category: string | null
    visibility: string
    theme: string
    ends_at: string | null
    media_mode?: 'image' | 'video'
  }) => Promise<CreatedWar>
  addContestant: (warId: string, payload: { name: string; bio: string | null }) => Promise<CreatedContestant>
  uploadImage: (warId: string, contestantId: string, file: File) => Promise<void>
  attachVideo: (warId: string, contestantId: string, payload: { url: string; start_seconds: number; end_seconds?: number }) => Promise<void>
  uploadShareImage: (warId: string, file: File) => Promise<void>
}

export interface ImportResult {
  warId: string | null
  error: string | null
}

function warPayload(metadata: ValidatedWarImport['metadata']): Parameters<ImportApi['createWar']>[0] {
  const payload = {
    title: metadata.title,
    category: metadata.category,
    visibility: metadata.visibility,
    theme: metadata.theme,
    ends_at: metadata.ends_at,
  }
  return metadata.media_mode === 'video' ? { ...payload, media_mode: 'video' } : payload
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

function fileFromZip(path: string, files: Record<string, Uint8Array>): File {
  const bytes = files[path]
  return new File([bytes as Uint8Array<ArrayBuffer>], fileNameFor(path), { type: mimeTypeFor(path) })
}

function videoUrl(media: WarExportVideoMedia): string {
  return media.provider === 'youtube'
    ? `https://www.youtube.com/watch?v=${media.video_id}`
    : `https://vimeo.com/${media.video_id}`
}

function videoPayload(media: WarExportVideoMedia): { url: string; start_seconds: number; end_seconds?: number } {
  const payload: { url: string; start_seconds: number; end_seconds?: number } = { url: videoUrl(media), start_seconds: media.start_seconds }
  if (media.end_seconds !== null) payload.end_seconds = media.end_seconds
  return payload
}

async function importContestant(
  warId: string,
  contestant: WarExportContestant,
  files: Record<string, Uint8Array>,
  api: ImportApi,
): Promise<void> {
  const created = await api.addContestant(warId, { name: contestant.name, bio: contestant.bio })
  for (const media of contestant.media) {
    if (media.kind === 'video') await api.attachVideo(warId, created.id, videoPayload(media))
    else await api.uploadImage(warId, created.id, fileFromZip(media.path, files))
  }
}

export async function importWar(validated: ValidatedWarImport, files: Record<string, Uint8Array>, api: ImportApi): Promise<ImportResult> {
  const { share_image } = validated.metadata
  let warId: string
  try {
    const war = await api.createWar(warPayload(validated.metadata))
    warId = war.id
  } catch (error) {
    return { warId: null, error: toUserMessage(error) }
  }

  try {
    if (share_image) {
      await api.uploadShareImage(warId, fileFromZip(share_image, files))
    }
    for (const contestant of validated.contestants) {
      await importContestant(warId, contestant, files, api)
    }
  } catch (error) {
    return { warId, error: toUserMessage(error) }
  }

  return { warId, error: null }
}
