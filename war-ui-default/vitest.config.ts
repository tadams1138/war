import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The acceptance steps and playwright-bdd's generated tests run via `npm run test:acceptance`, not vitest.
    exclude: ['node_modules/**', 'tests/acceptance/**', '.features-gen/**'],
    environment: 'jsdom',
    // Node's fetch requires an absolute URL, so give api/client.ts an origin.
    env: {
      VITE_API_BASE_URL: 'http://localhost/api/v1',
    },
  },
})
