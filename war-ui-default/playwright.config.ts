import { defineConfig } from '@playwright/test'
import { defineBddProject } from 'playwright-bdd'

export default defineConfig({
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
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
})
