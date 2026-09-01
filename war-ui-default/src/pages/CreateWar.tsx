// The War creation wizard (war-ui-default-spec.md §4, §6, §12). Each step
// calls the API immediately -- the state machine driving that lives in
// useCreateWarWizard; this component is rendering only, mirroring
// VoteMode/useVoteSession's split.
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CreateWarPayload, WarSummary } from '../api/client'
import { useCreateWarWizard, type WizardContestant, type WizardState } from '../createWar/useCreateWarWizard'

type MetadataState = Extract<WizardState, { step: 'metadata' }>
type ContestantsState = Extract<WizardState, { step: 'contestants' }>
type ReviewState = Extract<WizardState, { step: 'review' }>

export function CreateWar() {
  const navigate = useNavigate()
  const onActivated = (war: WarSummary) => navigate(`/wars/${war.id}/vote`)
  const { state, submitMetadata, submitContestant, attachImages, proceedToReview, activate } = useCreateWarWizard(onActivated)

  if (state.step === 'metadata') return <MetadataStepView state={state} onSubmit={submitMetadata} />
  if (state.step === 'contestants') {
    return (
      <ContestantsStepView
        state={state}
        onAddContestant={submitContestant}
        onAttachImages={attachImages}
        onContinue={proceedToReview}
      />
    )
  }
  return <ReviewStepView state={state} onActivate={activate} />
}

function MetadataStepView({ state, onSubmit }: { state: MetadataState; onSubmit: (payload: CreateWarPayload) => void }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'invite_only'>('public')
  const [endsAt, setEndsAt] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit({
      title,
      category: category.length > 0 ? category : null,
      visibility,
      ends_at: endsAt.length > 0 ? new Date(endsAt).toISOString() : null,
    })
  }

  return (
    <main>
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
          End date
          <input
            type="date"
            data-testid="metadata-ends-at-input"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </label>
        {state.error && (
          <p role="alert" data-testid="metadata-error">
            {state.error}
          </p>
        )}
        <button type="submit" data-testid="metadata-submit" disabled={state.submitting}>
          Continue
        </button>
      </form>
    </main>
  )
}

function ContestantsStepView({
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

function ReviewStepView({ state, onActivate }: { state: ReviewState; onActivate: () => void }) {
  return (
    <main>
      <h1>Review</h1>
      <ul>
        {state.contestants.map((contestant) => (
          <li key={contestant.id} data-testid="review-contestant">
            <span>{contestant.name}</span>
            <span>{contestant.hasImage ? 'Has image' : 'No image'}</span>
          </li>
        ))}
      </ul>
      {state.activateDetails && (
        <ul role="alert" data-testid="activate-error">
          {state.activateDetails.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      <button type="button" data-testid="activate-submit" onClick={onActivate} disabled={state.activating}>
        Activate War
      </button>
    </main>
  )
}
