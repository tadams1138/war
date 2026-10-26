// State machine behind EditWar (spec §6.1: a War is always editable by its
// creator, in any status) — extracted out of the page component, mirroring
// useVoteSession's split for the same reason.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addContestant as addContestantApi,
  clearVotes as clearVotesApi,
  deleteContestant as deleteContestantApi,
  deleteContestantMedia,
  getWar,
  patchContestant,
  patchWar,
  publishWar,
  reorderContestantMedia,
  unpublishWar,
  uploadContestantImages,
  uploadShareImage as uploadShareImageApi,
  type ContestantDetail,
  type MediaItem,
  type PatchContestantPayload,
  type PatchWarPayload,
  type WarDetailResponse,
  type WarSummary,
} from '../api/client'
import { ApiError, isRateLimited, toUserMessage } from '../api/errors'
import { byDisplayOrder } from '../utils/media'

export interface ImageNotice {
  message: string
  kind: 'error' | 'wait'
}

// Unsaved name/bio text of a contestant editor or of the add form. Kept here,
// outside the loaded state, so it survives switching panes (the editors
// unmount) and quiet refetches.
export interface ContestantDraft {
  name: string
  bio: string
}

const EMPTY_DRAFT: ContestantDraft = { name: '', bio: '' }

export interface EditWarDrafts {
  draftFor: (contestant: ContestantDetail) => ContestantDraft
  addDraft: ContestantDraft
  setContestantDraft: (contestantId: string, draft: ContestantDraft) => void
  setAddDraft: (draft: ContestantDraft) => void
}

export interface EditWarLoadedState {
  status: 'loaded'
  war: WarDetailResponse
  metadataError: string | null
  savingMetadata: boolean
  addContestantError: string | null
  // Keyed by contestant id -- each contestant's own save can fail
  // independently of every other's, and of the metadata form's.
  contestantErrors: Record<string, string | null>
  // Keyed by contestant id. Separate from contestantErrors because a
  // rate-limited upload is a wait, not an error, and the two must never
  // clobber each other.
  imageErrors: Record<string, ImageNotice | null>
  // Set on a successful metadata or contestant save; Toast owns clearing
  // its own visibility, so this never needs to be reset back to null.
  toast: string | null
  // Set while a Publish/Unpublish request is in flight, and to the API's
  // own validation messages when one fails -- war-spec.md's one deliberate
  // exception to generic 422 copy.
  publishing: boolean
  publishDetails: string[] | null
  clearingVotes: boolean
}

export type EditWarState = { status: 'loading' } | { status: 'error'; message: string } | EditWarLoadedState

export interface EditWarActions {
  saveMetadata: (payload: PatchWarPayload) => Promise<void>
  uploadShareImage: (blob: Blob) => Promise<void>
  saveContestant: (contestantId: string, payload: PatchContestantPayload) => Promise<void>
  addContestant: (name: string, bio: string | null) => Promise<ContestantDetail | null>
  removeContestant: (contestantId: string) => Promise<boolean>
  addImages: (contestantId: string, files: File[]) => Promise<void>
  removeImage: (contestantId: string, mediaId: string) => Promise<void>
  moveImageUp: (contestantId: string, mediaId: string) => Promise<void>
  publish: () => Promise<void>
  unpublish: () => Promise<void>
  clearVotes: () => Promise<void>
}

/**
 * The Publish/Unpublish action's own error copy (war-spec.md's deliberate
 * exception to its generic 422 copy): the API's `details` array verbatim
 * when the failure actually carries one, falling back to the generic
 * message otherwise.
 */
function detailsFromPublishError(error: unknown): string[] {
  if (error instanceof ApiError && error.reason === 'validation' && error.details) {
    return error.details
  }
  return [toUserMessage(error)]
}

function swapPartner(war: WarDetailResponse, contestantId: string, mediaId: string): { current: MediaItem; previous: MediaItem } | null {
  const contestant = war.contestants.find((c) => c.id === contestantId)
  const sorted = byDisplayOrder(contestant?.media ?? [])
  const index = sorted.findIndex((m) => m.id === mediaId)
  return index > 0 ? { current: sorted[index], previous: sorted[index - 1] } : null
}

type Update = (prev: EditWarLoadedState) => EditWarLoadedState

const keep: Update = (prev) => prev
const patch = (changes: Partial<EditWarLoadedState>): Update => (prev) => ({ ...prev, ...changes })
const setWar = (war: (prev: WarDetailResponse) => WarDetailResponse, changes: Partial<EditWarLoadedState> = {}): Update => (prev) => ({ ...prev, ...changes, war: war(prev.war) })
const setContestantError = (id: string, message: string | null): Update => (prev) => ({ ...prev, contestantErrors: { ...prev.contestantErrors, [id]: message } })
const setImageNotice = (id: string, notice: ImageNotice | null): Update => (prev) => ({ ...prev, imageErrors: { ...prev.imageErrors, [id]: notice } })

export function useEditWar(
  warId: string | undefined,
  onPublished?: (war: WarSummary) => void,
): { state: EditWarState; drafts: EditWarDrafts } & EditWarActions {
  const [state, setState] = useState<EditWarState>({ status: 'loading' })
  const [contestantDrafts, setContestantDrafts] = useState<Record<string, ContestantDraft>>({})
  const [addDraft, setAddDraft] = useState<ContestantDraft>(EMPTY_DRAFT)
  const setContestantDraft = (contestantId: string, draft: ContestantDraft): void =>
    setContestantDrafts((prev) => ({ ...prev, [contestantId]: draft }))
  const clearContestantDraft = (contestantId: string): void =>
    setContestantDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== contestantId)))
  // The unsaved draft if there is one, else the contestant as last saved.
  const draftFor = (contestant: ContestantDetail): ContestantDraft =>
    contestantDrafts[contestant.id] ?? { name: contestant.name, bio: contestant.bio ?? '' }
  // Keyed by contestant id, like imageErrors -- each contestant's rate-limit
  // wait clears itself independently on its own timer.
  const imageWaitTimersRef = useRef<Record<string, number>>({})

  // `quiet` swaps in the refetched War without passing through 'loading',
  // which would unmount the page and lose the open editor's unsaved edits.
  const load = useCallback(async (quiet = false): Promise<void> => {
    if (!warId) return
    if (!quiet) setState({ status: 'loading' })
    try {
      const war = await getWar(warId)
      setState({
        status: 'loaded',
        war,
        metadataError: null,
        savingMetadata: false,
        addContestantError: null,
        contestantErrors: {},
        imageErrors: {},
        toast: null,
        publishing: false,
        publishDetails: null,
        clearingVotes: false,
      })
    } catch (error) {
      setState({ status: 'error', message: toUserMessage(error) })
    }
  }, [warId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const timers = imageWaitTimersRef.current
    return () => Object.values(timers).forEach((timer) => window.clearTimeout(timer))
  }, [])

  function setLoaded(update: Update): void {
    setState((prev) => (prev.status !== 'loaded' ? prev : update(prev)))
  }

  // One mutation of the loaded War: apply `start`, make the call, then apply
  // `ok` (default: nothing) or `fail`. Resolves to the call's result, or null when it failed (or
  // there was nothing loaded to mutate).
  async function mutate<T>(start: Update, call: (warId: string) => Promise<T>, fail: (error: unknown) => Update, ok: (result: T) => Update = () => keep): Promise<{ value: T } | null> {
    if (!warId || state.status !== 'loaded') return null
    setLoaded(start)
    try {
      const value = await call(warId)
      setLoaded(ok(value))
      return { value }
    } catch (error) {
      setLoaded(fail(error))
      return null
    }
  }

  const saveMetadata = async (payload: PatchWarPayload): Promise<void> => {
    await mutate(
      patch({ savingMetadata: true, metadataError: null }),
      (id) => patchWar(id, payload),
      (error) => patch({ savingMetadata: false, metadataError: toUserMessage(error) }),
      (summary) => setWar((war) => ({ ...war, ...summary }), { savingMetadata: false, toast: 'War details saved' }),
    )
  }

  const saveContestant = async (contestantId: string, payload: PatchContestantPayload): Promise<void> => {
    const replace = (war: WarDetailResponse, contestant: ContestantDetail) => ({
      ...war,
      contestants: war.contestants.map((c) => (c.id === contestantId ? contestant : c)),
    })
    const result = await mutate(
      setContestantError(contestantId, null),
      (id) => patchContestant(id, contestantId, payload),
      (error) => setContestantError(contestantId, toUserMessage(error)),
      (contestant) => setWar((war) => replace(war, contestant), { toast: 'Contestant saved' }),
    )
    if (result) clearContestantDraft(contestantId)
  }

  const addContestant = async (name: string, bio: string | null): Promise<ContestantDetail | null> => {
    const result = await mutate(
      patch({ addContestantError: null }),
      (id) => addContestantApi(id, { name, bio }),
      (error) => patch({ addContestantError: toUserMessage(error) }),
      (contestant) => setWar((war) => ({ ...war, contestants: [...war.contestants, contestant] })),
    )
    if (result) setAddDraft(EMPTY_DRAFT)
    return result?.value ?? null
  }

  // The API clears a removed contestant's votes itself (spec §6.1); the
  // "ask first" confirmation lives in EditWar.tsx. Resolves to whether the
  // contestant was removed; a failure is shown on that contestant's editor.
  const removeContestant = async (contestantId: string): Promise<boolean> => {
    const result = await mutate(
      keep,
      (id) => deleteContestantApi(id, contestantId),
      (error) => setContestantError(contestantId, toUserMessage(error)),
      () => (prev) => {
        const contestantErrors = { ...prev.contestantErrors }
        delete contestantErrors[contestantId]
        return { ...prev, contestantErrors, war: { ...prev.war, contestants: prev.war.contestants.filter((c) => c.id !== contestantId) } }
      },
    )
    return result !== null
  }

  // Image mutations all refetch the whole War afterward rather than
  // patching local state by hand: the upload response carries no URL
  // (war-api, `POST .../images` returns only `{ id, display_order }`), so a
  // freshly uploaded image's displayable variants only ever come from a
  // War-detail fetch.
  const thenReload = (call: (warId: string) => Promise<unknown>) => async (id: string) => {
    await call(id)
    await load(true)
  }

  const mutateImage = async (contestantId: string, call: (warId: string) => Promise<unknown>, start: Update = keep): Promise<void> => {
    const fail = (error: unknown) =>
      isRateLimited(error)
        ? applyImageRateLimit(contestantId, error)
        : setImageNotice(contestantId, { message: toUserMessage(error), kind: 'error' })
    await mutate(start, thenReload(call), fail)
  }

  const addImages = async (contestantId: string, files: File[]): Promise<void> => {
    if (files.length === 0) return
    await mutateImage(contestantId, (id) => uploadContestantImages(id, contestantId, files), setImageNotice(contestantId, null))
  }

  const removeImage = (contestantId: string, mediaId: string): Promise<void> =>
    mutateImage(contestantId, (id) => deleteContestantMedia(id, contestantId, mediaId))

  // A swap, not a relocation -- moving an image up trades its
  // display_order with its immediate predecessor's, so both sides of the
  // pair change and neither ends up sharing an order value with a third
  // image.
  const moveImageUp = async (contestantId: string, mediaId: string): Promise<void> => {
    const pair = state.status === 'loaded' ? swapPartner(state.war, contestantId, mediaId) : null
    if (!pair) return
    const { current, previous } = pair
    await mutateImage(contestantId, (id) =>
      Promise.all([
        reorderContestantMedia(id, contestantId, current.id, previous.display_order),
        reorderContestantMedia(id, contestantId, previous.id, current.display_order),
      ]),
    )
  }

  // Mirrors useVoteSession's applyRateLimit: shows the wait (war-spec.md
  // §10.5, never an error) and clears itself once the delay passes, no
  // action required from the creator.
  function applyImageRateLimit(contestantId: string, error: ApiError): Update {
    window.clearTimeout(imageWaitTimersRef.current[contestantId])
    imageWaitTimersRef.current[contestantId] = window.setTimeout(
      () => setLoaded(setImageNotice(contestantId, null)),
      (error.retryAfterSeconds ?? 0) * 1000,
    )
    return setImageNotice(contestantId, { message: error.message, kind: 'wait' })
  }

  // Fired from the metadata form's submit(), before its own PATCH, only
  // when a pending upload or generated image exists (spec: deferred until
  // Save). Refetches the War afterward so the saved share_image_url is what
  // renders.
  const uploadShareImage = async (blob: Blob): Promise<void> => {
    await mutate(keep, thenReload((id) => uploadShareImageApi(id, blob)), (error) => patch({ metadataError: toUserMessage(error) }))
  }

  const publishFailed = (error: unknown): Update => patch({ publishing: false, publishDetails: detailsFromPublishError(error) })
  const startPublishing = patch({ publishing: true, publishDetails: null })

  const publish = async (): Promise<void> => {
    await mutate(startPublishing, publishWar, publishFailed, (published) => {
      onPublished?.(published)
      return keep
    })
  }

  const unpublish = async (): Promise<void> => {
    await mutate(startPublishing, unpublishWar, publishFailed, (unpublished) =>
      setWar((war) => ({ ...war, ...unpublished }), { publishing: false }),
    )
  }

  const clearVotes = async (): Promise<void> => {
    await mutate(
      patch({ clearingVotes: true }),
      thenReload(clearVotesApi),
      (error) => patch({ clearingVotes: false, metadataError: toUserMessage(error) }),
      () => patch({ toast: 'Votes cleared' }),
    )
  }

  return {
    state,
    drafts: { draftFor, addDraft, setContestantDraft, setAddDraft },
    saveMetadata,
    uploadShareImage,
    saveContestant,
    addContestant,
    removeContestant,
    addImages,
    removeImage,
    moveImageUp,
    publish,
    unpublish,
    clearVotes,
  }
}
