// EditWar's War-metadata form. Rendering only -- state and the PATCH call
// live in useEditWar. Theme now lives here too (moved off the deleted
// creation wizard, the spec's "Create War"/"Editing a draft") — a draft's
// theme is editable the same way every other field here is, since there is
// no longer a one-time wizard step to set it at creation instead.
//
// Exposes an imperative `submit()` via ref, and reports its own dirty state
// via `onDirtyChange`, so EditWar's Activate button -- a sibling, not a
// parent of this form's fields -- can gate on unsaved edits without this
// component giving up ownership of its own field state (war-spec.md 10.4's
// Activate dirty-check/confirm step).
import { forwardRef, useEffect, useImperativeHandle, useState, type FormEvent } from 'react'
import type { PatchWarPayload, WarDetailResponse } from '../api/client'
import { THEME_LABELS, THEMES, type Theme } from '../theme/themeCookie'

interface EditWarMetadataFormProps {
  war: WarDetailResponse
  error: string | null
  saving: boolean
  onSave: (payload: PatchWarPayload) => void
  onDirtyChange?: (dirty: boolean) => void
}

export interface EditWarMetadataFormHandle {
  submit: () => void
}

// The `<input type="date">` value shape (YYYY-MM-DD) an ISO timestamp
// collapses to -- needed both as the field's initial value and again in the
// dirty check, so it's a named function rather than the same slice repeated
// twice inline.
function endsAtInputValue(endsAt: string | null): string {
  return endsAt ? endsAt.slice(0, 10) : ''
}

function valueOrEmpty(value: string | null): string {
  return value ?? ''
}

function computeIsDirty(
  war: WarDetailResponse,
  fields: { title: string; category: string; visibility: string; theme: string; endsAt: string },
): boolean {
  return (
    fields.title !== valueOrEmpty(war.title) ||
    fields.category !== valueOrEmpty(war.category) ||
    fields.visibility !== war.visibility ||
    fields.theme !== war.theme ||
    fields.endsAt !== endsAtInputValue(war.ends_at)
  )
}

function MetadataSaveError({ titleRequiredError, error }: { titleRequiredError: string | null; error: string | null }) {
  if (!titleRequiredError && !error) return null
  return (
    <p role="alert" data-testid="edit-war-metadata-error">
      {titleRequiredError ?? error}
    </p>
  )
}

export const EditWarMetadataForm = forwardRef<EditWarMetadataFormHandle, EditWarMetadataFormProps>(
  function EditWarMetadataForm({ war, error, saving, onSave, onDirtyChange }, ref) {
  const [title, setTitle] = useState(war.title ?? '')
  const [category, setCategory] = useState(war.category ?? '')
  const [visibility, setVisibility] = useState<'public' | 'invite_only'>(war.visibility)
  const [theme, setTheme] = useState<Theme>(war.theme as Theme)
  const [endsAt, setEndsAt] = useState(endsAtInputValue(war.ends_at))
  const [titleRequiredError, setTitleRequiredError] = useState<string | null>(null)

  const isDirty = computeIsDirty(war, { title, category, visibility, theme, endsAt })

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  function submit() {
    // Checked before any request goes out (the spec, "client-side
    // validate mandatory fields") -- an empty title is never valid.
    if (title.trim().length === 0) {
      setTitleRequiredError('Title is required')
      return
    }
    setTitleRequiredError(null)
    onSave({
      title,
      category: category.length > 0 ? category : null,
      visibility,
      theme,
      ends_at: endsAt.length > 0 ? new Date(endsAt).toISOString() : null,
    })
  }

  useImperativeHandle(ref, () => ({ submit }))

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
      <MetadataSaveError titleRequiredError={titleRequiredError} error={error} />
      <button type="submit" data-testid="edit-war-metadata-submit" disabled={saving}>
        Save
      </button>
    </form>
  )
  },
)
