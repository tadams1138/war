// Resolves NavBar's identity slot from a getMe() AsyncResourceState
// (war-ui-default-spec.md §6, "NavBar" — Identity). Kept as a pure
// function, separate from NavBar's own rendering, so the fallback rules —
// including the GET /auth/me failure case the Gherkin has no scenario for —
// are unit-testable without mounting a component.
import type { AsyncResourceState } from '../hooks/useAsyncResource'
import type { VoterMe } from '../api/client'

export const FALLBACK_DISPLAY_NAME = 'Voter'

export interface VoterIdentity {
  displayName: string
  avatarUrl: string | null
}

export function resolveVoterIdentity(state: AsyncResourceState<VoterMe>): VoterIdentity {
  if (state.status !== 'loaded') {
    // Covers both 'loading' and 'error' (§6: a failed profile fetch never
    // blocks navigation — only the identity slot falls back).
    return { displayName: FALLBACK_DISPLAY_NAME, avatarUrl: null }
  }
  return {
    displayName: state.value.voter.display_name ?? FALLBACK_DISPLAY_NAME,
    avatarUrl: state.value.voter.avatar_url,
  }
}
