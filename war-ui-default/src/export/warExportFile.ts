// The shape of `war.json` inside a War export zip: written by exportWar.ts,
// read back by import/validateWarImport.ts.
export interface WarExportImageMedia {
  kind?: 'image'
  display_order: number
  aspect_ratio: number | null
  path: string
}

export interface WarExportVideoMedia {
  kind: 'video'
  provider: 'youtube' | 'vimeo'
  video_id: string
  start_seconds: number
  end_seconds: number | null
  path?: never
}

export type WarExportMedia = WarExportImageMedia | WarExportVideoMedia

export interface WarExportContestant {
  name: string
  bio: string | null
  media: WarExportMedia[]
}

export type WarExportMetadata = {
  media_mode?: 'image' | 'video'
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
