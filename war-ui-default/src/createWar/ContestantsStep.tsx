// The CreateWar wizard's Contestants step view (the spec).
// Rendering only -- state and API calls live in useCreateWarWizard.
import { useState, type FormEvent } from 'react'
import type { Theme } from '../theme/themeCookie'
import type { WizardContestant, WizardState } from './useCreateWarWizard'

// Mirrors war-api's own per-contestant cap
// (war-api/src/contestants/imageUploadService.ts) -- purely a UX
// convenience so the wizard stops offering an input it knows the API
// would 422; the API remains the actual enforcement point.
const MAX_IMAGES_PER_CONTESTANT = 10

type ContestantsState = Extract<WizardState, { step: 'contestants' }>

export function ContestantsStepView({
  state,
  onAddContestant,
  onAttachImages,
  onContinue,
  theme,
}: {
  state: ContestantsState
  onAddContestant: (name: string, bio?: string) => void
  onAttachImages: (contestantId: string, files: File[]) => void
  onContinue: () => void
  theme: Theme
}) {
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [nameRequiredError, setNameRequiredError] = useState<string | null>(null)

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    // Checked before any request goes out (the spec, "client-side
    // validate mandatory fields") -- an empty name is never valid.
    if (name.trim().length === 0) {
      setNameRequiredError('Name is required')
      return
    }
    setNameRequiredError(null)
    onAddContestant(name, bio)
    setName('')
    setBio('')
  }

  return (
    <main data-theme={theme}>
      <h1>Add contestants</h1>
      <form onSubmit={handleAdd}>
        <label>
          Name
          <input data-testid="contestant-name-input" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Bio
          <input data-testid="contestant-bio-input" value={bio} onChange={(event) => setBio(event.target.value)} />
        </label>
        {(nameRequiredError || state.nameError) && (
          <p role="alert" data-testid="contestant-error">
            {nameRequiredError ?? state.nameError}
          </p>
        )}
        <button type="submit" data-testid="add-contestant-submit" disabled={state.submittingContestant}>
          Add contestant
        </button>
      </form>
      {state.imageError && (
        <p role="alert" data-testid="contestant-image-error">
          {state.imageError}
        </p>
      )}
      <ul>
        {state.contestants.map((contestant) => (
          <ContestantListItem key={contestant.id} contestant={contestant} onAttachImages={onAttachImages} />
        ))}
      </ul>
      <button type="button" data-testid="proceed-to-review" onClick={onContinue}>
        Continue to review
      </button>
    </main>
  )
}

function ContestantListItem({
  contestant,
  onAttachImages,
}: {
  contestant: WizardContestant
  onAttachImages: (contestantId: string, files: File[]) => void
}) {
  return (
    <li className="wizard-contestant-row" data-testid="wizard-contestant">
      <span>{contestant.name}</span>
      {contestant.imageCount > 0 && (
        <span data-testid="contestant-has-image">
          {contestant.imageCount} {contestant.imageCount === 1 ? 'image' : 'images'} added
        </span>
      )}
      {contestant.imageCount < MAX_IMAGES_PER_CONTESTANT ? (
        <label>
          Image
          <input
            type="file"
            accept="image/*"
            multiple
            data-testid="contestant-image-input"
            onChange={(event) => {
              const files = event.target.files ? Array.from(event.target.files) : []
              onAttachImages(contestant.id, files)
            }}
          />
        </label>
      ) : (
        <span data-testid="contestant-image-cap-reached">Maximum of {MAX_IMAGES_PER_CONTESTANT} images reached</span>
      )}
    </li>
  )
}
