import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

async function enableMocking(): Promise<void> {
  const [{ worker }, { buildScenarioHandlers }, client] = await Promise.all([
    import('./mocks/browser'),
    import('./mocks/scenarios'),
    import('./api/client'),
  ])

  window.__mswCallLog = []
  worker.events.on('request:start', async ({ request }) => {
    const body = request.method === 'POST' ? await request.clone().text() : undefined
    window.__mswCallLog?.push({ method: request.method, url: request.url, time: Date.now(), body })
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
