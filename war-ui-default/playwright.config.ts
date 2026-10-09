import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/acceptance',
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
