import { defineConfig } from '@playwright/test'
import { defineBddProject } from 'playwright-bdd'
import { CONVERTED_FEATURES } from './tests/bindings/convertedFeatures'

export default defineConfig({
  projects: [
    {
      // Features executed step by step (tests/acceptance/steps). Listed
      // explicitly: the other features/*.feature are still title-bound to
      // hand-written specs, and features/pending/ must never run. `bddgen`
      // (run by `npm run test:acceptance`) generates the tests into
      // .features-gen/.
      ...defineBddProject({
        name: 'bdd',
        features: CONVERTED_FEATURES.map((name) => `features/${name}.feature`),
        steps: ['tests/acceptance/steps/*.ts'],
      }),
    },
    {
      name: 'specs',
      testDir: './tests/acceptance',
      testMatch: '*.spec.ts',
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
