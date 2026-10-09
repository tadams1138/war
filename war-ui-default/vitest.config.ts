import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Playwright specs run via `npm run test:acceptance`, not vitest.
    exclude: ['node_modules/**', 'tests/acceptance/**'],
    environment: 'jsdom',
    // Node's fetch requires an absolute URL, so give api/client.ts an origin.
    env: {
      VITE_API_BASE_URL: 'http://localhost/api/v1',
    },
  },
})
