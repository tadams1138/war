// The shape of `war.json` inside a War export zip: written by exportWar.ts,
// read back by import/validateWarImport.ts.
export interface WarExportMedia {
  display_order: number
  aspect_ratio: number | null
  path: string
}

export interface WarExportContestant {
  name: string
  bio: string | null
  media: WarExportMedia[]
}

export type WarExportMetadata = {
  title: string | null
  category: string | null
  visibility: string
  theme: string
  ends_at: string | null
  share_image: string | null
}

export type WarExportFile = WarExportMetadata & {
  contestants: WarExportContestant[]
}
