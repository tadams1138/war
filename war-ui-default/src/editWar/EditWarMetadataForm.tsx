// EditWar's War-metadata form. Rendering only -- state and the PATCH call
// live in useEditWar. Theme now lives here too (moved off the deleted
// creation wizard, the spec's "Create War"/"Editing a draft") — a draft's
// theme is editable the same way every other field here is, since there is
// no longer a one-time wizard step to set it at creation instead.
//
// Exposes an imperative `submit()` via ref, so EditWar's Publish/Unpublish
// button -- a sibling, not a parent of this form's fields -- can trigger a
// save without this component giving up ownership of its own field state.
import { forwardRef, useEffect, useImperativeHandle, useState, type FormEvent } from 'react'
import type { PatchWarPayload, WarDetailResponse } from '../api/client'
import { THEME_LABELS, THEMES, type Theme } from '../theme/themeCookie'
import { generateShareImage } from './generateShareImage'

interface EditWarMetadataFormProps {
  war: WarDetailResponse
  error: string | null
  saving: boolean
  onSave: (payload: PatchWarPayload) => void
  // Deferred like every other field on this form (spec, "neither an upload
  // nor a generated preview takes effect until Save is pressed") -- called
  // from submit(), before onSave, only when a pending image exists.
  onUploadShareImage: (blob: Blob) => Promise<void>
}

export interface EditWarMetadataFormHandle {
  submit: () => void
}

// The `<input type="date">` value shape (YYYY-MM-DD) an ISO timestamp
// collapses to -- needed as the field's initial value.
function endsAtInputValue(endsAt: string | null): string {
  return endsAt ? endsAt.slice(0, 10) : ''
}

function MetadataSaveError({ titleRequiredError, error }: { titleRequiredError: string | null; error: string | null }) {
  if (!titleRequiredError && !error) return null
  return (
    <p role="alert" data-testid="edit-war-metadata-error">
      {titleRequiredError ?? error}
    </p>
  )
}

// Extracted purely to keep EditWarMetadataForm's own cyclomatic complexity
// down (CLAUDE.md's <=5 rule) -- the preview/upload/generate trio has
// several independent branches (a pending preview vs. the saved image vs.
// neither, the generate control's disabled/explanatory state) that read
// better isolated than folded into the parent's own render.
function ShareImageField({
  previewUrl,
  canGenerate,
  onFileSelected,
  onGenerateClick,
}: {
  previewUrl: string | null
  canGenerate: boolean
  onFileSelected: (file: File) => void
  onGenerateClick: () => void
}) {
  return (
    <div>
      <p>Share image</p>
      {previewUrl && <img data-testid="edit-war-share-image-preview" src={previewUrl} alt="Share image preview" width={300} height={158} />}
      <label>
        Upload an image
        <input
          type="file"
          accept="image/*"
          data-testid="edit-war-share-image-input"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onFileSelected(file)
          }}
        />
      </label>
      <button type="button" data-testid="edit-war-share-image-generate" disabled={!canGenerate} onClick={onGenerateClick}>
        Generate from contestants
      </button>
      {!canGenerate && (
        <p data-testid="edit-war-share-image-generate-unavailable">
          Add at least two contestants with an image each to generate a share image.
        </p>
      )}
    </div>
  )
}

export const EditWarMetadataForm = forwardRef<EditWarMetadataFormHandle, EditWarMetadataFormProps>(
  function EditWarMetadataForm({ war, error, saving, onSave, onUploadShareImage }, ref) {
  const [title, setTitle] = useState(war.title ?? '')
  const [category, setCategory] = useState(war.category ?? '')
  const [visibility, setVisibility] = useState<'public' | 'invite_only'>(war.visibility)
  const [theme, setTheme] = useState<Theme>(war.theme as Theme)
  const [endsAt, setEndsAt] = useState(endsAtInputValue(war.ends_at))
  const [titleRequiredError, setTitleRequiredError] = useState<string | null>(null)
  const [pendingShareImage, setPendingShareImage] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // The pending preview is a local object URL, not the saved share_image_url
  // -- revoked whenever it's replaced or the component unmounts, so a
  // re-roll or a cancelled edit never leaks one.
  useEffect(() => {
    if (!pendingShareImage) return
    const url = URL.createObjectURL(pendingShareImage)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingShareImage])

  async function submit() {
    // Checked before any request goes out (the spec, "client-side
    // validate mandatory fields") -- an empty title is never valid.
    if (title.trim().length === 0) {
      setTitleRequiredError('Title is required')
      return
    }
    setTitleRequiredError(null)
    if (pendingShareImage) {
      await onUploadShareImage(pendingShareImage)
    }
    onSave({
      title,
      category: category.length > 0 ? category : null,
      visibility,
      theme,
      ends_at: endsAt.length > 0 ? new Date(endsAt).toISOString() : null,
    })
  }

  useImperativeHandle(ref, () => ({ submit: () => void submit() }))

  const qualifyingContestants = war.contestants.filter((c) => c.media.length > 0).length
  const canGenerate = qualifyingContestants >= 2

  async function handleGenerate() {
    const blob = await generateShareImage(war)
    if (blob) setPendingShareImage(blob)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    submit()
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Title
        <input data-testid="edit-war-title-input" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Category
        <input
          data-testid="edit-war-category-input"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
      </label>
      <label>
        Visibility
        <select
          data-testid="edit-war-visibility-select"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as 'public' | 'invite_only')}
        >
          <option value="public">Public</option>
          <option value="invite_only">Invite only</option>
        </select>
      </label>
      <label>
        Theme
        <select
          data-testid="edit-war-theme-select"
          value={theme}
          onChange={(event) => setTheme(event.target.value as Theme)}
        >
          {THEMES.map((option) => (
            <option key={option} value={option}>
              {THEME_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <label>
        End date
        <input
          type="date"
          data-testid="edit-war-ends-at-input"
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
        />
      </label>
      <ShareImageField
        previewUrl={previewUrl ?? war.share_image_url}
        canGenerate={canGenerate}
        onFileSelected={setPendingShareImage}
        onGenerateClick={() => void handleGenerate()}
      />
      <MetadataSaveError titleRequiredError={titleRequiredError} error={error} />
      <button type="submit" data-testid="edit-war-metadata-submit" disabled={saving}>
        Save
      </button>
    </form>
  )
  },
)
