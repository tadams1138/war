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
  onSave: (payload: { name: string; bio: string | null }) => Promise<void>
  onRemove: () => void
  onAddImages: (files: File[]) => void
  onRemoveImage: (mediaId: string) => void
  onMoveImageUp: (mediaId: string) => void
}

export function EditWarContestant({
  contestant,
  error,
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
        {(nameRequiredError || error) && (
          <p role="alert" data-testid="edit-war-contestant-error">
            {nameRequiredError ?? error}
          </p>
        )}
        <button type="submit" data-testid="edit-war-contestant-submit" disabled={saving}>
          Save
        </button>
      </form>
      <ul className="image-gallery">
        {sortedMedia.map((media, index) => (
          <li key={media.id} className="image-gallery-item" data-testid="edit-war-contestant-image" data-media-id={media.id}>
            <img
              src={media.variants[0]?.url}
              alt={`${contestant.name}, image ${index + 1} of ${sortedMedia.length}`}
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
      {sortedMedia.length < MAX_IMAGES_PER_CONTESTANT ? (
        <label>
          Add image
          <input
            type="file"
            accept="image/*"
            multiple
            data-testid="edit-war-image-input"
            onChange={(event) => {
              const files = event.target.files ? Array.from(event.target.files) : []
              if (files.length > 0) onAddImages(files)
              event.target.value = ''
            }}
          />
        </label>
      ) : (
        <span data-testid="edit-war-image-cap-reached">Maximum of {MAX_IMAGES_PER_CONTESTANT} images reached</span>
      )}
    </li>
  )
}
