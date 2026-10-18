import type { VoterMe } from '../api/client'
import { useAuth } from './context'

// The signed-in Voter's identity once it has loaded, else null: the roles
// decide what a page offers, but the page reads fine without them.
export function useViewer(): VoterMe['voter'] | null {
  const { me } = useAuth()
  return me.status === 'loaded' ? me.value.voter : null
}
