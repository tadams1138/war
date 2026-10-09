// Cursor-paged moderation log, newest first (war-spec.md §6.7).
import { getModerationLog, type ModerationLogEntry } from '../api/client'
import { useCursorPage } from '../hooks/useCursorPage'

export interface UseModerationLogResult {
  status: 'loading' | 'loaded' | 'error'
  entries: ModerationLogEntry[]
  hasMore: boolean
  loadingMore: boolean
  error: string | null
  loadMore: () => void
}

// `refreshToken` changing refetches the first page, replacing what is shown.
export function useModerationLog(refreshToken: number): UseModerationLogResult {
  const { items, ...rest } = useCursorPage(
    (cursor) => getModerationLog({ cursor }).then((page) => ({ items: page.entries, nextCursor: page.next_cursor })),
    [refreshToken],
  )
  return { ...rest, entries: items }
}
