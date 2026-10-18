import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.{test,spec,steps}.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    globalSetup: ['test/setup/globalSetup.ts'],
    setupFiles: ['test/setup/perFile.ts'],
    // Only active under `npm run test:coverage` (--coverage); plain `npm test` stays uninstrumented.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text-summary', 'html', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // Write the report even when a test file fails (CI still reports the failure).
      reportOnFailure: true,
    },
  },
});
