import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // tests/acceptance/**/*.spec.ts are Playwright specs, run via
    // `npm run test:acceptance`, not vitest — without this exclude vitest
    // tries to run them too and fails ("Playwright Test did not expect
    // test() to be called here").
    exclude: ['node_modules/**', 'tests/acceptance/**'],
  },
})
