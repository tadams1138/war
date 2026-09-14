import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import type { MswCallLogEntry } from './mocks/testHooks'
import './index.css'

async function enableMocking(): Promise<void> {
  const [{ worker }, { buildScenarioHandlers }, client] = await Promise.all([
    import('./mocks/browser'),
    import('./mocks/scenarios'),
    import('./api/client'),
  ])

  window.__mswCallLog = []
  worker.events.on('request:start', ({ request }) => {
    // Pushed synchronously so a caller reading the log right after
    // triggering the request (e.g. an in-flight-state assertion) sees it —
    // an awaited push here would race that read under load. The body, only
    // needed for POST/PATCH assertions, is attached once its clone resolves.
    const entry: MswCallLogEntry = { method: request.method, url: request.url, time: Date.now() }
    window.__mswCallLog?.push(entry)
    if (request.method === 'POST' || request.method === 'PATCH') {
      void request
        .clone()
        .text()
        .then((body) => {
          entry.body = body
        })
    }
  })

  await worker.start({ onUnhandledRequest: 'bypass' })

  const override = window.__mswScenarioOverride
  if (override) {
    worker.use(...buildScenarioHandlers(override))
  }

  window.__msw = { worker }
  window.__apiClient = client
}

async function bootstrap(): Promise<void> {
  if (import.meta.env.VITE_API_MOCKING === 'enabled') {
    await enableMocking()
  }

  createRoot(document.getElementById('app')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
