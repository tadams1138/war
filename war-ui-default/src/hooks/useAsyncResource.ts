// The loading | loaded | error state machine shared by every page that
// fetches one resource on mount and renders it.
import { useEffect, useState } from 'react'
import { toUserMessage } from '../api/errors'
import { useLatest } from './useLatest'

export type AsyncResourceState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; value: T }
  | { status: 'error'; message: string }

export type ResourceDeps = readonly (string | number | boolean | null | undefined)[]

/**
 * Runs `load` again whenever `deps` (primitives only) change, and tracks its
 * outcome. `load` may be `undefined` to skip fetching -- WarDetail's `id`
 * route param can be momentarily absent, and the page should stay `loading`
 * rather than call the API without it.
 */
export function useAsyncResource<T>(load: (() => Promise<T>) | undefined, deps: ResourceDeps): AsyncResourceState<T> {
  const [state, setState] = useState<AsyncResourceState<T>>({ status: 'loading' })
  const latestLoad = useLatest(load)
  const depsKey = JSON.stringify(deps)

  useEffect(() => {
    const run = latestLoad.current
    if (!run) return
    let cancelled = false
    run()
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
  }, [depsKey, latestLoad])

  return state
}
