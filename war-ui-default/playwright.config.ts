import { defineConfig } from '@playwright/test'
import { defineBddProject } from 'playwright-bdd'

// `npm run test:acceptance:coverage` sets COVERAGE=1: the mock build is
// instrumented (vite.config.ts) and steps/fixtures.ts writes each test's
// window.__coverage__ into .nyc_output/.
const coverage = process.env.COVERAGE === '1'

// The mock build's MSW service worker fetches the page's unmocked requests
// itself, out of reach of page.route. This makes Playwright route those too, so
// the video steps can stand in for the providers' scripts and frames
// (support/fakeVideoProviders.ts) and run the real player adapters.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'

export default defineConfig({
  globalSetup: coverage ? './tests/acceptance/coverageSetup.ts' : undefined,
  projects: [
    {
      // Every feature is executed step by step (tests/acceptance/steps). `bddgen`
      // (run by `npm run test:acceptance`) generates the tests into
      // .features-gen/. The glob stops at features/: features/pending/ holds
      // scenarios with no steps yet and must never run.
      ...defineBddProject({
        name: 'bdd',
        features: 'features/*.feature',
        steps: ['tests/acceptance/steps/*.ts'],
      }),
    },
  ],
  webServer: {
    // Builds first because CI runs acceptance tests before its own Build
    // step. build:mock (not build) enables the MSW mocks the suite runs
    // against, never a live API.
    command: 'npm run build:mock && npm run preview -- --port 4173',
    port: 4173,
    // Never reuse a server during a coverage run: it could be an
    // uninstrumented build (the run then fails on the busy port instead of
    // silently reporting no coverage).
    reuseExistingServer: !process.env.CI && !coverage,
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
})
