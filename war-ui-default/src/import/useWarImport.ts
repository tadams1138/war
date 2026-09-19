import { useState } from 'react'
import {
  addContestant,
  createWar,
  uploadContestantImages,
  type CreateWarPayload,
  type ResolvedAttribute,
} from '../api/client'
import { importWar, type ImportApi } from './importWar'
import { validateWarImport } from './validateWarImport'

export interface WarImportState {
  error: string | null
  importing: boolean
}

// The exported shape carries each contestant's attributes already resolved
// (ResolvedAttribute[]: {key, label, type, value}) -- recreating a
// contestant needs them back as the {key: value} map addContestant expects.
function toAttributesRecord(attributes: unknown[]): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  for (const attribute of attributes as ResolvedAttribute[]) {
    record[attribute.key] = attribute.value
  }
  return record
}

// The exported metadata's `visibility`/`theme`/`contestant_schema` are only
// structurally validated (spec §10.4: shape and completeness, not deep enum
// membership) -- an invalid value here surfaces as an ordinary 422 from the
// real `createWar` call below, handled the same as any other createWar
// failure (importWar.ts's own createWar error path).
function toCreateWarPayload(metadata: Parameters<ImportApi['createWar']>[0]): CreateWarPayload {
  return {
    title: metadata.title ?? undefined,
    category: metadata.category,
    visibility: metadata.visibility as CreateWarPayload['visibility'],
    theme: metadata.theme as CreateWarPayload['theme'],
    ends_at: metadata.ends_at,
    contestant_schema: metadata.contestant_schema as CreateWarPayload['contestant_schema'],
  }
}

const realImportApi: ImportApi = {
  createWar: (payload) => createWar(toCreateWarPayload(payload)),
  addContestant: (warId, payload) =>
    addContestant(warId, { name: payload.name, bio: payload.bio, attributes: toAttributesRecord(payload.attributes) }),
  uploadImage: async (warId, contestantId, file) => {
    await uploadContestantImages(warId, contestantId, [file])
  },
}

// The new draft is left findable via My Wars either way (spec §10.4,
// "Import"): a full success calls `onImported` to jump straight to it, same
// as Create War's own instant-draft-to-Edit-page flow; a partial failure
// (the War exists, a contestant or image didn't) shows its error here
// instead and does not navigate -- the creator finds the draft in the list
// like any other, rather than being carried to it mid-error.
export function useWarImport(onImported: (warId: string) => void): { state: WarImportState; importFile: (file: File) => void } {
  const [state, setState] = useState<WarImportState>({ error: null, importing: false })

  async function run(file: File): Promise<void> {
    setState({ error: null, importing: true })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const validated = validateWarImport(bytes)
    if (!validated.ok) {
      setState({ error: validated.error, importing: false })
      return
    }

    const result = await importWar(validated.data, validated.files, realImportApi)
    setState({ error: result.error, importing: false })
    if (result.warId && !result.error) {
      onImported(result.warId)
    }
  }

  return { state, importFile: (file) => void run(file) }
}
