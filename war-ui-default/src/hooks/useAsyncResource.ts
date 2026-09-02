// The loading | loaded | error state machine shared by every page that
// fetches one resource on mount and renders it (Home, MyWars, WarDetail) --
// the cancelled-flag effect and toUserMessage catch, extracted once those
// three pages held near-identical copies (SOLID review finding 8).
import { useEffect, useState } from 'react'
import { toUserMessage } from '../api/errors'

export type AsyncResourceState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; value: T }
  | { status: 'error'; message: string }

/**
 * Runs `load` once per change of `deps` (the same dependency array
 * `useEffect` takes) and tracks its outcome. `load` may be `undefined` to
 * skip fetching entirely — WarDetail's `id` route param can be momentarily
 * absent, and the page should simply stay `loading` rather than call the
 * API with it missing.
 */
export function useAsyncResource<T>(load: (() => Promise<T>) | undefined, deps: unknown[]): AsyncResourceState<T> {
  const [state, setState] = useState<AsyncResourceState<T>>({ status: 'loading' })

  useEffect(() => {
    if (!load) return
    let cancelled = false
    load()
      .then((value) => {
        if (!cancelled) setState({ status: 'loaded', value })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({ status: 'error', message: toUserMessage(error) })
      })
    return () => {
      cancelled = true
    }
  }, deps)

  return state
}
