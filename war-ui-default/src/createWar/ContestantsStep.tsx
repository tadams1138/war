// The CreateWar wizard's Contestants step view (war-ui-default-spec.md §6).
// Rendering only -- state and API calls live in useCreateWarWizard.
import { useState, type FormEvent } from 'react'
import type { WizardContestant, WizardState } from './useCreateWarWizard'

type ContestantsState = Extract<WizardState, { step: 'contestants' }>

export function ContestantsStepView({
  state,
  onAddContestant,
  onAttachImages,
  onContinue,
}: {
  state: ContestantsState
  onAddContestant: (name: string, bio?: string) => void
  onAttachImages: (contestantId: string, files: File[]) => void
  onContinue: () => void
}) {
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    onAddContestant(name, bio)
    setName('')
    setBio('')
  }

  return (
    <main>
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
        {state.nameError && (
          <p role="alert" data-testid="contestant-error">
            {state.nameError}
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
    <li data-testid="wizard-contestant">
      <span>{contestant.name}</span>
      {contestant.hasImage ? (
        <span data-testid="contestant-has-image">Image added</span>
      ) : (
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
      )}
    </li>
  )
}
