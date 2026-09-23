// State machine behind EditWar (the spec's approved scope: draft-only
// editing of a War's metadata and its contestants' name, bio, and images) —
// extracted out of the page component, mirroring useVoteSession's split for
// the same reason.
import { useEffect, useRef, useState } from 'react'
import {
  activateWar,
  addContestant as addContestantApi,
  deleteContestant as deleteContestantApi,
  deleteContestantMedia,
  getWar,
  patchContestant,
  patchWar,
  reorderContestantMedia,
  uploadContestantImages,
  uploadShareImage as uploadShareImageApi,
  type ContestantDetail,
  type PatchContestantPayload,
  type PatchWarPayload,
  type WarDetailResponse,
  type WarSummary,
} from '../api/client'
import { ApiError, toUserMessage } from '../api/errors'

export interface EditWarLoadedState {
  status: 'loaded'
  war: WarDetailResponse
  metadataError: string | null
  savingMetadata: boolean
  addContestantError: string | null
  // Keyed by contestant id -- each contestant's own save can fail
  // independently of every other's, and of the metadata form's.
  contestantErrors: Record<string, string | null>
  // Keyed by contestant id, like contestantErrors -- a separate field
  // rather than reusing it because a rate-limited upload (the spec §10.5:
  // "a wait, using the supplied delay -- never presented as an error")
  // needs different presentation than an ordinary upload failure, and the
  // two must never clobber each other if a save error and an image error
  // are both live for the same contestant.
  imageErrors: Record<string, { message: string; kind: 'error' | 'wait' } | null>
  // Set on a successful metadata or contestant save; Toast owns clearing
  // its own visibility, so this never needs to be reset back to null.
  toast: string | null
  // Set while an Activate request is in flight, and to the API's own
  // validation messages when one fails -- mirrors the deleted wizard's
  // Review step, the spec's one deliberate exception to generic 422 copy.
  activating: boolean
  activateDetails: string[] | null
}

export type EditWarState =
  | { status: 'loading' }
  | { status: 'notEditable' }
  | { status: 'error'; message: string }
  | EditWarLoadedState

export interface EditWarActions {
  saveMetadata: (payload: PatchWarPayload) => Promise<void>
  uploadShareImage: (blob: Blob) => Promise<void>
  saveContestant: (contestantId: string, payload: PatchContestantPayload) => Promise<void>
  addContestant: (name: string, bio: string | null) => Promise<ContestantDetail | null>
  removeContestant: (contestantId: string) => Promise<void>
  addImages: (contestantId: string, files: File[]) => Promise<void>
  removeImage: (contestantId: string, mediaId: string) => Promise<void>
  moveImageUp: (contestantId: string, mediaId: string) => Promise<void>
  activate: () => Promise<void>
}

/**
 * The Activate action's own error copy (the spec's deliberate exception to
 * its generic 422 copy): the API's `details` array verbatim when the
 * failure actually carries one, falling back to the generic message
 * otherwise.
 */
function detailsFromActivateError(error: unknown): string[] {
  if (error instanceof ApiError && error.reason === 'validation' && error.details) {
    return error.details
  }
  return [toUserMessage(error)]
}

function isRateLimited(error: unknown): error is ApiError & { reason: 'rate-limited' } {
  return error instanceof ApiError && error.reason === 'rate-limited'
}

function withContestant(
  war: WarDetailResponse,
  contestantId: string,
  update: ContestantDetail,
): WarDetailResponse {
  return { ...war, contestants: war.contestants.map((c) => (c.id === contestantId ? update : c)) }
}

export function useEditWar(
  warId: string | undefined,
  onActivated?: (war: WarSummary) => void,
): { state: EditWarState } & EditWarActions {
  const [state, setState] = useState<EditWarState>({ status: 'loading' })
  // Keyed by contestant id, like imageErrors -- each contestant's rate-limit
  // wait clears itself independently on its own timer.
  const imageWaitTimersRef = useRef<Record<string, number>>({})

  async function load(): Promise<void> {
    if (!warId) return
    setState({ status: 'loading' })
    try {
      const war = await getWar(warId)
      if (war.status !== 'draft') {
        setState({ status: 'notEditable' })
        return
      }
      setState({
        status: 'loaded',
        war,
        metadataError: null,
        savingMetadata: false,
        addContestantError: null,
        contestantErrors: {},
        imageErrors: {},
        toast: null,
        activating: false,
        activateDetails: null,
      })
    } catch (error) {
      setState({ status: 'error', message: toUserMessage(error) })
    }
  }

  useEffect(() => {
    void load()
    return () => {
      Object.values(imageWaitTimersRef.current).forEach((timer) => window.clearTimeout(timer))
    }
  }, [warId])

  function setLoaded(update: (prev: EditWarLoadedState) => EditWarLoadedState): void {
    setState((prev) => (prev.status !== 'loaded' ? prev : update(prev)))
  }

  async function saveMetadata(payload: PatchWarPayload): Promise<void> {
    if (!warId || state.status !== 'loaded') return
    setLoaded((prev) => ({ ...prev, savingMetadata: true, metadataError: null }))
    try {
      const summary = await patchWar(warId, payload)
      setLoaded((prev) => ({ ...prev, war: { ...prev.war, ...summary }, savingMetadata: false, toast: 'War details saved' }))
    } catch (error) {
      setLoaded((prev) => ({ ...prev, savingMetadata: false, metadataError: toUserMessage(error) }))
    }
  }

  // Fired from the metadata form's submit(), before its own PATCH, only
  // when a pending upload or generated image exists (spec: deferred until
  // Save). Reloads the War afterward so the saved share_image_url is what
  // renders, the same reload-after-mutation pattern addImages uses.
  async function uploadShareImage(blob: Blob): Promise<void> {
    if (!warId) return
    try {
      await uploadShareImageApi(warId, blob)
      await load()
    } catch (error) {
      setLoaded((prev) => ({ ...prev, metadataError: toUserMessage(error) }))
    }
  }

  async function saveContestant(contestantId: string, payload: PatchContestantPayload): Promise<void> {
    if (!warId || state.status !== 'loaded') return
    setLoaded((prev) => ({ ...prev, contestantErrors: { ...prev.contestantErrors, [contestantId]: null } }))
    try {
      const contestant = await patchContestant(warId, contestantId, payload)
      setLoaded((prev) => ({ ...prev, war: withContestant(prev.war, contestantId, contestant), toast: 'Contestant saved' }))
    } catch (error) {
      setLoaded((prev) => ({
        ...prev,
        contestantErrors: { ...prev.contestantErrors, [contestantId]: toUserMessage(error) },
      }))
    }
  }

  async function addContestant(name: string, bio: string | null): Promise<ContestantDetail | null> {
    if (!warId || state.status !== 'loaded') return null
    setLoaded((prev) => ({ ...prev, addContestantError: null }))
    try {
      const contestant = await addContestantApi(warId, { name, bio })
      setLoaded((prev) => ({ ...prev, war: { ...prev.war, contestants: [...prev.war.contestants, contestant] } }))
      return contestant
    } catch (error) {
      setLoaded((prev) => ({ ...prev, addContestantError: toUserMessage(error) }))
      return null
    }
  }

  async function removeContestant(contestantId: string): Promise<void> {
    if (!warId || state.status !== 'loaded') return
    await deleteContestantApi(warId, contestantId)
    setLoaded((prev) => {
      const contestantErrors = { ...prev.contestantErrors }
      delete contestantErrors[contestantId]
      return {
        ...prev,
        war: { ...prev.war, contestants: prev.war.contestants.filter((c) => c.id !== contestantId) },
        contestantErrors,
      }
    })
  }

  // Image mutations all reload the whole War afterward rather than
  // patching local state by hand: the upload response carries no URL
  // (war-api, `POST .../images` returns only `{ id, display_order }`), so a
  // freshly uploaded image's displayable variants only ever come from a
  // War-detail fetch.
  async function addImages(contestantId: string, files: File[]): Promise<void> {
    if (!warId || files.length === 0) return
    setLoaded((prev) => ({ ...prev, imageErrors: { ...prev.imageErrors, [contestantId]: null } }))
    try {
      await uploadContestantImages(warId, contestantId, files)
      await load()
    } catch (error) {
      if (isRateLimited(error)) {
        applyImageRateLimit(contestantId, error)
        return
      }
      setLoaded((prev) => ({
        ...prev,
        imageErrors: { ...prev.imageErrors, [contestantId]: { message: toUserMessage(error), kind: 'error' } },
      }))
    }
  }

  // Mirrors useVoteSession's applyRateLimit: shows the wait (the spec
  // §10.5, never an error) and clears itself once the delay passes, no
  // action required from the creator.
  function applyImageRateLimit(contestantId: string, error: ApiError): void {
    setLoaded((prev) => ({
      ...prev,
      imageErrors: { ...prev.imageErrors, [contestantId]: { message: error.message, kind: 'wait' } },
    }))
    window.clearTimeout(imageWaitTimersRef.current[contestantId])
    imageWaitTimersRef.current[contestantId] = window.setTimeout(() => {
      setLoaded((prev) => ({ ...prev, imageErrors: { ...prev.imageErrors, [contestantId]: null } }))
    }, (error.retryAfterSeconds ?? 0) * 1000)
  }

  async function removeImage(contestantId: string, mediaId: string): Promise<void> {
    if (!warId) return
    await deleteContestantMedia(warId, contestantId, mediaId)
    await load()
  }

  // A swap, not a relocation -- moving an image up trades its
  // display_order with its immediate predecessor's, so both sides of the
  // pair change and neither ends up sharing an order value with a third
  // image.
  async function moveImageUp(contestantId: string, mediaId: string): Promise<void> {
    if (!warId || state.status !== 'loaded') return
    const contestant = state.war.contestants.find((c) => c.id === contestantId)
    if (!contestant) return
    const sorted = [...contestant.media].sort((a, b) => a.display_order - b.display_order)
    const index = sorted.findIndex((m) => m.id === mediaId)
    if (index <= 0) return
    const current = sorted[index]
    const previous = sorted[index - 1]
    await Promise.all([
      reorderContestantMedia(warId, contestantId, current.id, previous.display_order),
      reorderContestantMedia(warId, contestantId, previous.id, current.display_order),
    ])
    await load()
  }

  async function activate(): Promise<void> {
    if (!warId || state.status !== 'loaded') return
    setLoaded((prev) => ({ ...prev, activating: true, activateDetails: null }))
    try {
      const activated = await activateWar(warId)
      onActivated?.(activated)
    } catch (error) {
      setLoaded((prev) => ({ ...prev, activating: false, activateDetails: detailsFromActivateError(error) }))
    }
  }

  return {
    state,
    saveMetadata,
    uploadShareImage,
    saveContestant,
    addContestant,
    removeContestant,
    addImages,
    removeImage,
    moveImageUp,
    activate,
  }
}
