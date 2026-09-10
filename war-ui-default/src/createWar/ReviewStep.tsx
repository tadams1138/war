// The CreateWar wizard's Review step view (the spec).
// Rendering only -- state and API calls live in useCreateWarWizard.
import type { WizardState } from './useCreateWarWizard'

type ReviewState = Extract<WizardState, { step: 'review' }>

export function ReviewStepView({ state, onActivate }: { state: ReviewState; onActivate: () => void }) {
  const { war } = state
  return (
    <main>
      <h1>Review</h1>
      <dl>
        <dt>Title</dt>
        <dd data-testid="review-title">{war.title}</dd>
        {war.category && (
          <>
            <dt>Category</dt>
            <dd data-testid="review-category">{war.category}</dd>
          </>
        )}
        <dt>Visibility</dt>
        <dd data-testid="review-visibility">{war.visibility}</dd>
        {war.ends_at && (
          <>
            <dt>End date</dt>
            <dd data-testid="review-ends-at">{war.ends_at}</dd>
          </>
        )}
      </dl>
      <ul>
        {state.contestants.map((contestant) => (
          <li key={contestant.id} data-testid="review-contestant">
            <span>{contestant.name}</span>
            {/* An indicator only, never the image itself: the images
                endpoint returns no URL (the spec), so
                nothing the wizard holds after an upload can be rendered
                as an <img>. */}
            {contestant.hasImage ? (
              <span data-testid="review-contestant-has-image">Image attached</span>
            ) : (
              <span data-testid="review-contestant-no-image">No image</span>
            )}
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
