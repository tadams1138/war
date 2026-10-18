import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The acceptance steps and playwright-bdd's generated tests run via `npm run test:acceptance`, not vitest.
    exclude: ['node_modules/**', 'tests/acceptance/**', '.features-gen/**', 'coverage/**', '.nyc_output/**', '.nyc-unit/**', '.nyc-merged/**'],
    environment: 'jsdom',
    // Istanbul (not v8) so the unit coverage merges with the acceptance
    // coverage (nyc). JSON goes to .nyc-unit/, which `coverage:report` reads.
    coverage: {
      provider: 'istanbul',
      include: ['src/**'],
      exclude: ['src/api/generated/**', 'src/mocks/**', 'src/**/__tests__/**', 'src/**/*.test.{ts,tsx}'],
      reporter: ['json'],
      reportsDirectory: '.nyc-unit',
      reportOnFailure: true,
    },
    // Node's fetch requires an absolute URL, so give api/client.ts an origin.
    env: {
      VITE_API_BASE_URL: 'http://localhost/api/v1',
    },
  },
})
