// The CreateWar wizard's Metadata step view (the spec).
// Rendering only -- state and API calls live in useCreateWarWizard.
import { useState, type FormEvent } from 'react'
import type { CreateWarPayload } from '../api/client'
import { THEME_LABELS, THEMES, type Theme } from '../theme/themeCookie'
import type { WizardState } from './useCreateWarWizard'

type MetadataState = Extract<WizardState, { step: 'metadata' }>

export function MetadataStepView({
  state,
  onSubmit,
  theme: pageTheme,
}: {
  state: MetadataState
  onSubmit: (payload: CreateWarPayload) => void
  theme: Theme
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'invite_only'>('public')
  const [theme, setTheme] = useState<Theme>('arcade')
  const [endsAt, setEndsAt] = useState('')
  const [titleRequiredError, setTitleRequiredError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Checked before any request goes out (the spec, "client-side
    // validate mandatory fields") -- an empty title is never valid.
    if (title.trim().length === 0) {
      setTitleRequiredError('Title is required')
      return
    }
    setTitleRequiredError(null)
    onSubmit({
      title,
      category: category.length > 0 ? category : null,
      visibility,
      theme,
      ends_at: endsAt.length > 0 ? new Date(endsAt).toISOString() : null,
    })
  }

  return (
    <main data-theme={pageTheme}>
      <h1>Create a War</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Title
          <input data-testid="metadata-title-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Category
          <input
            data-testid="metadata-category-input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </label>
        <label>
          Visibility
          <select
            data-testid="metadata-visibility-select"
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
            data-testid="metadata-theme-select"
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
            data-testid="metadata-ends-at-input"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </label>
        {(titleRequiredError || state.error) && (
          <p role="alert" data-testid="metadata-error">
            {titleRequiredError ?? state.error}
          </p>
        )}
        <button type="submit" data-testid="metadata-submit" disabled={state.submitting}>
          Continue
        </button>
      </form>
    </main>
  )
}
