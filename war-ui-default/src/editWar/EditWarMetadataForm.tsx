// EditWar's War-metadata form. Rendering only -- state and the PATCH call
// live in useEditWar. Mirrors CreateWar's MetadataStep field set except
// theme, which PATCH /wars/:id does not accept (war-api,
// warsService.ts's PatchWarInput) -- a War's theme is chosen once, at
// creation, and stays wizard-only.
import { useState, type FormEvent } from 'react'
import type { PatchWarPayload, WarDetailResponse } from '../api/client'

interface EditWarMetadataFormProps {
  war: WarDetailResponse
  error: string | null
  saving: boolean
  onSave: (payload: PatchWarPayload) => void
}

export function EditWarMetadataForm({ war, error, saving, onSave }: EditWarMetadataFormProps) {
  const [title, setTitle] = useState(war.title)
  const [category, setCategory] = useState(war.category ?? '')
  const [visibility, setVisibility] = useState<'public' | 'invite_only'>(war.visibility)
  const [endsAt, setEndsAt] = useState(war.ends_at ? war.ends_at.slice(0, 10) : '')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSave({
      title,
      category: category.length > 0 ? category : null,
      visibility,
      ends_at: endsAt.length > 0 ? new Date(endsAt).toISOString() : null,
    })
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
        End date
        <input
          type="date"
          data-testid="edit-war-ends-at-input"
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" data-testid="edit-war-metadata-error">
          {error}
        </p>
      )}
      <button type="submit" data-testid="edit-war-metadata-submit" disabled={saving}>
        Save
      </button>
    </form>
  )
}
