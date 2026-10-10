// Builds War export archives (spec §10.4, "Import") for the import steps.
import { strToU8, zipSync } from 'fflate'

export function validWarJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    title: 'Miss Universe 2026',
    category: 'Pageant',
    visibility: 'public',
    theme: 'arcade',
    ends_at: null,
    contestants: [
      {
        name: 'Ada',
        bio: 'A brilliant mathematician.',
        media: [{ display_order: 0, aspect_ratio: 0.75, path: 'media/c-1/m-1.jpg' }],
      },
    ],
    ...overrides,
  })
}

export function zipBuffer(files: Record<string, Uint8Array | string>): Buffer {
  const encoded: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries(files)) {
    encoded[path] = typeof content === 'string' ? strToU8(content) : content
  }
  return Buffer.from(zipSync(encoded))
}
