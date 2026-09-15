// State machine behind EditWar (the spec's approved scope: draft-only
// editing of a War's metadata and its contestants' name, bio, and images) —
// extracted out of the page component, mirroring useVoteSession's and
// useCreateWarWizard's split for the same reason.
import { useEffect, useState } from 'react'
import {
  addContestant as addContestantApi,
  deleteContestant as deleteContestantApi,
  deleteContestantMedia,
  getWar,
  patchContestant,
  patchWar,
  reorderContestantMedia,
  uploadContestantImages,
  type ContestantDetail,
  type PatchContestantPayload,
  type PatchWarPayload,
  type WarDetailResponse,
} from '../api/client'
import { toUserMessage } from '../api/errors'

export interface EditWarLoadedState {
  status: 'loaded'
  war: WarDetailResponse
  metadataError: string | null
  savingMetadata: boolean
  addContestantError: string | null
  // Keyed by contestant id -- each contestant's own save can fail
  // independently of every other's, and of the metadata form's.
  contestantErrors: Record<string, string | null>
}

export type EditWarState =
  | { status: 'loading' }
  | { status: 'notEditable' }
  | { status: 'error'; message: string }
  | EditWarLoadedState

export interface EditWarActions {
  saveMetadata: (payload: PatchWarPayload) => Promise<void>
  saveContestant: (contestantId: string, payload: PatchContestantPayload) => Promise<void>
  addContestant: (name: string, bio: string | null) => Promise<ContestantDetail | null>
  removeContestant: (contestantId: string) => Promise<void>
  addImages: (contestantId: string, files: File[]) => Promise<void>
  removeImage: (contestantId: string, mediaId: string) => Promise<void>
  moveImageUp: (contestantId: string, mediaId: string) => Promise<void>
}

function withContestant(
  war: WarDetailResponse,
  contestantId: string,
  update: ContestantDetail,
): WarDetailResponse {
  return { ...war, contestants: war.contestants.map((c) => (c.id === contestantId ? update : c)) }
}

export function useEditWar(warId: string | undefined): { state: EditWarState } & EditWarActions {
  const [state, setState] = useState<EditWarState>({ status: 'loading' })

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
      })
    } catch (error) {
      setState({ status: 'error', message: toUserMessage(error) })
    }
  }

  useEffect(() => {
    void load()
  }, [warId])

  function setLoaded(update: (prev: EditWarLoadedState) => EditWarLoadedState): void {
    setState((prev) => (prev.status !== 'loaded' ? prev : update(prev)))
  }

  async function saveMetadata(payload: PatchWarPayload): Promise<void> {
    if (!warId || state.status !== 'loaded') return
    setLoaded((prev) => ({ ...prev, savingMetadata: true, metadataError: null }))
    try {
      const summary = await patchWar(warId, payload)
      setLoaded((prev) => ({ ...prev, war: { ...prev.war, ...summary }, savingMetadata: false }))
    } catch (error) {
      setLoaded((prev) => ({ ...prev, savingMetadata: false, metadataError: toUserMessage(error) }))
    }
  }

  async function saveContestant(contestantId: string, payload: PatchContestantPayload): Promise<void> {
    if (!warId || state.status !== 'loaded') return
    setLoaded((prev) => ({ ...prev, contestantErrors: { ...prev.contestantErrors, [contestantId]: null } }))
    try {
      const contestant = await patchContestant(warId, contestantId, payload)
      setLoaded((prev) => ({ ...prev, war: withContestant(prev.war, contestantId, contestant) }))
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
    await uploadContestantImages(warId, contestantId, files)
    await load()
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

  return { state, saveMetadata, saveContestant, addContestant, removeContestant, addImages, removeImage, moveImageUp }
}
