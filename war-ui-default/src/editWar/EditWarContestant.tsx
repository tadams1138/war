// EditWar's per-contestant panel: name, bio, and image gallery management.
// Rendering only -- state and the API calls live in useEditWar.
import { useState, type FormEvent } from 'react'
import type { ContestantDetail } from '../api/client'
import { BioEditor } from '../bio/BioEditor'

// Mirrors war-api's own per-contestant cap
// (war-api/src/contestants/imageUploadService.ts) -- a UX convenience only,
// not the enforcement point.
const MAX_IMAGES_PER_CONTESTANT = 10

interface EditWarContestantProps {
  contestant: ContestantDetail
  error: string | null
  imageNotice: { message: string; kind: 'error' | 'wait' } | null
  onSave: (payload: { name: string; bio: string | null }) => Promise<void>
  onRemove: () => void
  onAddImages: (files: File[]) => void
  onRemoveImage: (mediaId: string) => void
  onMoveImageUp: (mediaId: string) => void
}

export function EditWarContestant({
  contestant,
  error,
  imageNotice,
  onSave,
  onRemove,
  onAddImages,
  onRemoveImage,
  onMoveImageUp,
}: EditWarContestantProps) {
  const [name, setName] = useState(contestant.name)
  const [bio, setBio] = useState(contestant.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [nameRequiredError, setNameRequiredError] = useState<string | null>(null)
  const sortedMedia = [...contestant.media].sort((a, b) => a.display_order - b.display_order)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Checked before any request goes out — an empty name is never valid,
    // so there is nothing the server needs to tell us that we don't
    // already know (the spec, "client-side validate mandatory fields").
    if (name.trim().length === 0) {
      setNameRequiredError('Name is required')
      return
    }
    setNameRequiredError(null)
    setSaving(true)
    await onSave({ name, bio: bio.length > 0 ? bio : null })
    setSaving(false)
  }

  return (
    <li data-testid="edit-war-contestant" data-contestant-id={contestant.id}>
      {/* The contestant's original name, not the live-edited `name` state
          -- an at-a-glance label identifying which panel this is, distinct
          from the editable field below. */}
      <h3>{contestant.name}</h3>
      <button type="button" data-testid="edit-war-contestant-remove" onClick={onRemove}>
        Remove contestant
      </button>
      <form onSubmit={handleSubmit}>
        <label>
          Name
          <input
            data-testid="edit-war-contestant-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <BioEditor value={bio} onChange={setBio} />
        <ContestantSaveError nameRequiredError={nameRequiredError} error={error} />
        <button type="submit" data-testid="edit-war-contestant-submit" disabled={saving}>
          Save
        </button>
      </form>
      <ContestantImageGallery
        contestantName={contestant.name}
        sortedMedia={sortedMedia}
        onRemoveImage={onRemoveImage}
        onMoveImageUp={onMoveImageUp}
      />
      <ImageNotice notice={imageNotice} />
      <AddImageControl imageCount={sortedMedia.length} onAddImages={onAddImages} waiting={imageNotice?.kind === 'wait'} />
    </li>
  )
}

// Rate-limited (the spec §10.5: "a wait, using the supplied delay --
// never presented as an error") renders on role="status", not
// role="alert" -- the same distinction useVoteSession's vote-error
// message already draws.
function ImageNotice({ notice }: { notice: { message: string; kind: 'error' | 'wait' } | null }) {
  if (!notice) return null
  if (notice.kind === 'wait') {
    return (
      <p role="status" data-testid="edit-war-image-wait">
        {notice.message}
      </p>
    )
  }
  return (
    <p role="alert" data-testid="edit-war-image-error">
      {notice.message}
    </p>
  )
}

function ContestantSaveError({ nameRequiredError, error }: { nameRequiredError: string | null; error: string | null }) {
  if (!nameRequiredError && !error) return null
  return (
    <p role="alert" data-testid="edit-war-contestant-error">
      {nameRequiredError ?? error}
    </p>
  )
}

function ContestantImageGallery({
  contestantName,
  sortedMedia,
  onRemoveImage,
  onMoveImageUp,
}: {
  contestantName: string
  sortedMedia: ContestantDetail['media']
  onRemoveImage: (mediaId: string) => void
  onMoveImageUp: (mediaId: string) => void
}) {
  return (
    <ul className="image-gallery">
      {sortedMedia.map((media, index) => (
        <li key={media.id} className="image-gallery-item" data-testid="edit-war-contestant-image" data-media-id={media.id}>
          <img
            src={media.variants[0]?.url}
            alt={`${contestantName}, image ${index + 1} of ${sortedMedia.length}`}
            style={{ aspectRatio: media.aspect_ratio ?? undefined }}
          />
          <div className="image-gallery-item-actions">
            {index > 0 && (
              <button type="button" data-testid="edit-war-image-move-up" onClick={() => onMoveImageUp(media.id)}>
                Move up
              </button>
            )}
            <button type="button" data-testid="edit-war-image-remove" onClick={() => onRemoveImage(media.id)}>
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function AddImageControl({
  imageCount,
  onAddImages,
  waiting,
}: {
  imageCount: number
  onAddImages: (files: File[]) => void
  waiting: boolean
}) {
  if (imageCount >= MAX_IMAGES_PER_CONTESTANT) {
    return <span data-testid="edit-war-image-cap-reached">Maximum of {MAX_IMAGES_PER_CONTESTANT} images reached</span>
  }
  return (
    <label>
      Add image
      <input
        type="file"
        accept="image/*"
        multiple
        disabled={waiting}
        data-testid="edit-war-image-input"
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : []
          if (files.length > 0) onAddImages(files)
          event.target.value = ''
        }}
      />
    </label>
  )
}
