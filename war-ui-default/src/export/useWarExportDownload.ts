import { useState } from 'react'
import type { WarDetailResponse } from '../api/client'
import { toUserMessage } from '../api/errors'
import { downloadBlob } from './downloadFile'
import { buildWarExportZip } from './exportWar'

async function fetchBinary(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  return new Uint8Array(await response.arrayBuffer())
}

export interface WarExportDownload {
  error: string | null
  trigger: () => void
}

// Builds from the War detail already loaded on the page (WarDetail and
// EditWar both already hold the full contestant list) -- export needs no
// GET of its own. Takes `war` as nullable so EditWar can call this hook
// unconditionally, above its own loading/error early returns (rules of
// hooks) -- the button that would trigger it isn't rendered until loaded
// anyway, but `trigger` no-ops defensively rather than assuming that.
export function useWarExportDownload(war: WarDetailResponse | null): WarExportDownload {
  const [error, setError] = useState<string | null>(null)

  async function run(): Promise<void> {
    if (!war) return
    setError(null)
    try {
      const zip = await buildWarExportZip(war, fetchBinary)
      downloadBlob(zip, `war-${war.id}.zip`)
    } catch (err) {
      setError(toUserMessage(err))
    }
  }

  return { error, trigger: () => void run() }
}
