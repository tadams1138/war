import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'mock-sw/**', 'playwright-report/**', 'test-results/**', '.features-gen/**', 'coverage/**', '.nyc_output/**', '.nyc-unit/**', '.nyc-merged/**', '.nyc-acceptance-mapped/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Root AGENTS.md: no function above cyclomatic complexity 5.
    rules: {
      complexity: ['error', 5],
    },
  },
)
