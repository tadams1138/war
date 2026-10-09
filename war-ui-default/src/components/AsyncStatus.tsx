import { ErrorMessage } from './ErrorMessage'

export function LoadingMessage() {
  return <p role="status">Loading…</p>
}

interface AsyncStatusProps {
  state: { status: 'loading' | 'loaded' | 'error'; message?: string }
}

// The loading text or error alert of a loading | loaded | error resource;
// nothing once loaded.
export function AsyncStatus({ state }: AsyncStatusProps) {
  if (state.status === 'loading') return <LoadingMessage />
  if (state.status === 'error') return <ErrorMessage message={state.message ?? null} />
  return null
}
