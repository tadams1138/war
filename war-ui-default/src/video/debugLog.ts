// Temporary diagnostics for video playback on phones. Turned on by a `?debug`
// URL flag, remembered for the browser tab so it survives a sign-in redirect.
// Remove once the mobile playback issue is understood.

const STORAGE_KEY = 'war-debug'
const MAX_ENTRIES = 200

function remembered(storage: Storage | undefined): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function remember(storage: Storage | undefined): void {
  try {
    storage?.setItem(STORAGE_KEY, '1')
  } catch {
    // Storage blocked: the flag lasts only for this page.
  }
}

export function isDebugEnabled(search: string, storage: Storage | undefined): boolean {
  if (!new URLSearchParams(search).has('debug')) return remembered(storage)
  remember(storage)
  return true
}

export interface DebugLog {
  add(event: string): void
  entries(): string[]
  subscribe(listener: () => void): () => void
}

export function createDebugLog(now: () => number): DebugLog {
  const started = now()
  let entries: string[] = []
  const listeners = new Set<() => void>()
  return {
    add(event) {
      const seconds = ((now() - started) / 1000).toFixed(1)
      entries = [...entries, `${seconds}s ${event}`].slice(-MAX_ENTRIES)
      listeners.forEach((listener) => listener())
    },
    entries: () => entries,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}

// Read on each call, not once at load: the vote page is often reached by
// in-app navigation after the first page has loaded.
export function videoDebugEnabled(): boolean {
  return isDebugEnabled(window.location.search, sessionStore())
}

export const videoDebugLog = createDebugLog(() => performance.now())

export function videoDebug(event: string): void {
  if (videoDebugEnabled()) videoDebugLog.add(event)
}
