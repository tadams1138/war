import { useState, type FormEvent } from 'react'
import type { ContestantVideoPayload, MediaItem } from '../api/client'

type VideoMedia = MediaItem & {
  provider?: 'youtube' | 'vimeo'
  video_id?: string
  start_seconds?: number
  end_seconds?: number | null
  duration_seconds?: number
  poster_url?: string | null
}

function videoPayload(url: string, start: string, end: string): ContestantVideoPayload {
  const payload: ContestantVideoPayload = { url: url.trim() }
  if (start !== '') payload.start_seconds = Number(start)
  if (end !== '') payload.end_seconds = Number(end)
  return payload
}

function clipEnd(media: VideoMedia): number {
  return media.end_seconds ?? media.duration_seconds ?? 0
}

function CurrentVideo({ media }: { media: VideoMedia | undefined }) {
  if (!media) return null
  return <div data-testid="edit-war-current-video">
    {media.poster_url && <img src={media.poster_url} alt="Video poster" width={200} />}
    <p>{media.provider} video {media.video_id}</p>
    <p>Clip: {media.start_seconds ?? 0}–{clipEnd(media)} seconds</p>
  </div>
}

export function ContestantVideoEditor({
  media,
  error,
  onSave,
}: {
  media: VideoMedia | undefined
  error: string | null
  onSave: (payload: ContestantVideoPayload, replace: boolean) => Promise<void>
}) {
  const [url, setUrl] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    try {
      await onSave(videoPayload(url, start, end), Boolean(media))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label="Contestant video">
      <CurrentVideo media={media} />
      <form onSubmit={(event) => void submit(event)}>
        <label>Video URL<input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} /></label>
        <label>Start seconds (optional)<input type="number" min="0" step="1" value={start} onChange={(event) => setStart(event.target.value)} /></label>
        <label>End seconds (optional)<input type="number" min="0" step="1" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        {error && <p role="alert" data-testid="edit-war-video-error">{error}</p>}
        <button type="submit" disabled={saving}>{media ? 'Replace video' : 'Attach video'}</button>
      </form>
    </section>
  )
}
