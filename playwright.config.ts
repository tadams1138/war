import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/acceptance',
  webServer: {
    // Must build first, not just preview: the CI pipeline (war-infra's
    // ui-default.yml) runs acceptance tests before its own separate Build
    // step, so this can't assume dist/ already exists.
    command: 'npm run build && npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
})
