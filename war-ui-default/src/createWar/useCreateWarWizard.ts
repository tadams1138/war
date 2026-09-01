// The CreateWar wizard's state machine (war-ui-default-spec.md §4, §6): each
// step calls the API immediately rather than staging everything for one
// final submit, exactly as §6 describes — there is no offline draft here,
// only the draft War itself. Extracted out of the CreateWar page so that
// component is rendering only, mirroring useVoteSession's split for the
// same reason.
import { useState } from 'react'
import {
  activateWar,
  addContestant,
  createWar,
  uploadContestantImages,
  type CreateWarPayload,
  type WarSummary,
} from '../api/client'
import { ApiError, toUserMessage } from '../api/errors'

export interface WizardContestant {
  id: string
  name: string
  hasImage: boolean
}

interface MetadataStep {
  step: 'metadata'
  submitting: boolean
  error: string | null
}

interface ContestantsStep {
  step: 'contestants'
  war: WarSummary
  contestants: WizardContestant[]
  submittingContestant: boolean
  nameError: string | null
  imageError: string | null
}

interface ReviewStep {
  step: 'review'
  war: WarSummary
  contestants: WizardContestant[]
  activating: boolean
  // The API's own validation message(s) shown verbatim, per spec §6's
  // deliberate exception to §8's generic 422 copy -- never the generic
  // "Something went wrong" text on this step.
  activateDetails: string[] | null
}

export type WizardState = MetadataStep | ContestantsStep | ReviewStep

export interface CreateWarWizard {
  state: WizardState
  submitMetadata: (payload: CreateWarPayload) => Promise<void>
  submitContestant: (name: string, bio?: string) => Promise<void>
  attachImages: (contestantId: string, files: File[]) => Promise<void>
  proceedToReview: () => void
  activate: () => Promise<void>
}

/** The generic §8 422 copy -- every step but Activate uses this, never the raw `details` array. */
function genericValidationMessage(error: unknown): string {
  return toUserMessage(error)
}

/**
 * The Activate step's own error copy (spec §6's deliberate exception to
 * §8): the API's `details` array verbatim when the failure actually carries
 * one, falling back to the generic message otherwise -- extracted out of
 * `activate` below to keep that function's branching within this repo's
 * complexity budget (CLAUDE.md, "Code quality").
 */
function detailsFromActivateError(error: unknown): string[] {
  if (error instanceof ApiError && error.reason === 'validation' && error.details) {
    return error.details
  }
  return [genericValidationMessage(error)]
}

export function useCreateWarWizard(onActivated: (war: WarSummary) => void): CreateWarWizard {
  const [state, setState] = useState<WizardState>({ step: 'metadata', submitting: false, error: null })

  async function submitMetadata(payload: CreateWarPayload): Promise<void> {
    if (state.step !== 'metadata') return
    setState({ step: 'metadata', submitting: true, error: null })
    try {
      const war = await createWar(payload)
      setState({ step: 'contestants', war, contestants: [], submittingContestant: false, nameError: null, imageError: null })
    } catch (error) {
      setState({ step: 'metadata', submitting: false, error: genericValidationMessage(error) })
    }
  }

  // Functional updaters throughout below: overlapping requests (adding a
  // contestant while an earlier image upload is still in flight, or two
  // image uploads racing each other) must each patch the latest state, not
  // the `contestants` array closed over before their own `await` -- writing
  // one back over the other's result would silently lose it (design review
  // finding 2). Each updater also patches only the fields its own operation
  // owns, rather than respelling the whole step object, so it never
  // clobbers a sibling field (e.g. imageError) a concurrent operation set.
  async function submitContestant(name: string, bio?: string): Promise<void> {
    if (state.step !== 'contestants') return
    const { war } = state
    setState((prev) => (prev.step !== 'contestants' ? prev : { ...prev, submittingContestant: true, nameError: null }))
    try {
      const contestant = await addContestant(war.id, { name, bio: bio || null })
      setState((prev) =>
        prev.step !== 'contestants'
          ? prev
          : {
              ...prev,
              contestants: [...prev.contestants, { id: contestant.id, name: contestant.name, hasImage: false }],
              submittingContestant: false,
              nameError: null,
            },
      )
    } catch (error) {
      setState((prev) =>
        prev.step !== 'contestants' ? prev : { ...prev, submittingContestant: false, nameError: genericValidationMessage(error) },
      )
    }
  }

  async function attachImages(contestantId: string, files: File[]): Promise<void> {
    if (state.step !== 'contestants' || files.length === 0) return
    const { war } = state
    try {
      await uploadContestantImages(war.id, contestantId, files)
      setState((prev) =>
        prev.step !== 'contestants'
          ? prev
          : { ...prev, contestants: prev.contestants.map((c) => (c.id === contestantId ? { ...c, hasImage: true } : c)) },
      )
    } catch (error) {
      setState((prev) => (prev.step !== 'contestants' ? prev : { ...prev, imageError: genericValidationMessage(error) }))
    }
  }

  function proceedToReview(): void {
    if (state.step !== 'contestants') return
    setState({ step: 'review', war: state.war, contestants: state.contestants, activating: false, activateDetails: null })
  }

  async function activate(): Promise<void> {
    if (state.step !== 'review') return
    setState({ ...state, activating: true, activateDetails: null })
    try {
      const war = await activateWar(state.war.id)
      onActivated(war)
    } catch (error) {
      setState({ ...state, activating: false, activateDetails: detailsFromActivateError(error) })
    }
  }

  return { state, submitMetadata, submitContestant, attachImages, proceedToReview, activate }
}
