import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/acceptance',
  webServer: {
    // Must build first, not just preview: the CI pipeline (war-infra's
    // ui-default.yml) runs acceptance tests before its own separate Build
    // step, so this can't assume dist/ already exists.
    //
    // build:mock (not build) — the acceptance suite runs against MSW
    // mocks built from war-api's generated OpenAPI document,
    // never a live API. This is the one place VITE_API_MOCKING is turned
    // on; the real `build`/`preview` a deploy uses never sets it.
    command: 'npm run build:mock && npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
})
