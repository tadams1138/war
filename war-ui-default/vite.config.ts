import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import istanbul from 'vite-plugin-istanbul'

const SERVICE_WORKER_FILE = 'mockServiceWorker.js'
const SERVICE_WORKER_SOURCE = new URL(`./mock-sw/${SERVICE_WORKER_FILE}`, import.meta.url)

// Serves MSW's service worker from the site root, in mock mode only (dev:mock
// and build:mock), so it never reaches a real deployment.
function mockServiceWorker(): Plugin {
  return {
    name: 'mock-service-worker',
    apply: (_config, env) => env.mode === 'mock',
    configureServer(server) {
      server.middlewares.use(`/${SERVICE_WORKER_FILE}`, (_request, response) => {
        response.setHeader('Content-Type', 'text/javascript')
        response.end(readFileSync(SERVICE_WORKER_SOURCE))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: SERVICE_WORKER_FILE, source: readFileSync(SERVICE_WORKER_SOURCE) })
    },
  }
}

// Acceptance coverage (`npm run test:acceptance:coverage`): COVERAGE=1 instruments
// src/** with istanbul so the browser exposes window.__coverage__, which
// tests/acceptance/steps/fixtures.ts collects into .nyc_output/. Unset, the
// build is untouched. Keep the excludes in step with vitest.config.ts.
function coverageInstrumentation(): Plugin[] {
  if (process.env.COVERAGE !== '1') return []
  return [
    istanbul({
      include: 'src/**',
      exclude: ['node_modules', 'src/api/generated/**', 'src/mocks/**', '**/__tests__/**', '**/*.test.*'],
      extension: ['.ts', '.tsx'],
      requireEnv: false,
      forceBuildInstrument: true,
    }),
  ]
}

// Static output only: no SSR, no server (war-spec.md §10).
export default defineConfig({
  plugins: [react(), tailwindcss(), mockServiceWorker(), ...coverageInstrumentation()],
})
