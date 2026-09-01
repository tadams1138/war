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
  warId: string
  contestants: WizardContestant[]
  submittingContestant: boolean
  nameError: string | null
  imageError: string | null
}

interface ReviewStep {
  step: 'review'
  warId: string
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
      setState({ step: 'contestants', warId: war.id, contestants: [], submittingContestant: false, nameError: null, imageError: null })
    } catch (error) {
      setState({ step: 'metadata', submitting: false, error: genericValidationMessage(error) })
    }
  }

  async function submitContestant(name: string, bio?: string): Promise<void> {
    if (state.step !== 'contestants') return
    const { warId, contestants } = state
    setState({ ...state, submittingContestant: true, nameError: null })
    try {
      const contestant = await addContestant(warId, { name, bio: bio || null })
      setState({
        step: 'contestants',
        warId,
        contestants: [...contestants, { id: contestant.id, name: contestant.name, hasImage: false }],
        submittingContestant: false,
        nameError: null,
        imageError: null,
      })
    } catch (error) {
      setState({ ...state, submittingContestant: false, nameError: genericValidationMessage(error) })
    }
  }

  async function attachImages(contestantId: string, files: File[]): Promise<void> {
    if (state.step !== 'contestants' || files.length === 0) return
    const { warId, contestants } = state
    try {
      await uploadContestantImages(warId, contestantId, files)
      setState({
        step: 'contestants',
        warId,
        contestants: contestants.map((c) => (c.id === contestantId ? { ...c, hasImage: true } : c)),
        submittingContestant: false,
        nameError: null,
        imageError: null,
      })
    } catch (error) {
      setState({ ...state, imageError: genericValidationMessage(error) })
    }
  }

  function proceedToReview(): void {
    if (state.step !== 'contestants') return
    setState({ step: 'review', warId: state.warId, contestants: state.contestants, activating: false, activateDetails: null })
  }

  async function activate(): Promise<void> {
    if (state.step !== 'review') return
    setState({ ...state, activating: true, activateDetails: null })
    try {
      const war = await activateWar(state.warId)
      onActivated(war)
    } catch (error) {
      setState({ ...state, activating: false, activateDetails: detailsFromActivateError(error) })
    }
  }

  return { state, submitMetadata, submitContestant, attachImages, proceedToReview, activate }
}
