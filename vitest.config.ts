import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // tests/acceptance/**/*.spec.ts are Playwright specs, run via
    // `npm run test:acceptance`, not vitest — without this exclude vitest
    // tries to run them too and fails ("Playwright Test did not expect
    // test() to be called here").
    exclude: ['node_modules/**', 'tests/acceptance/**'],
    environment: 'jsdom',
    // Node's fetch (undici) requires an absolute URL. Giving api/client.ts
    // an explicit origin here lets its default relative '/api/v1' base be
    // overridden the same way a real deploy would override it, and lets
    // unit tests register msw/node handlers against a fixed, known URL.
    env: {
      VITE_API_BASE_URL: 'http://localhost/api/v1',
    },
  },
})
