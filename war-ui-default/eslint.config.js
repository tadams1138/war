import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    // Root CLAUDE.md: flag any function's cyclomatic complexity above 5.
    // 'warn' -- not 'error' -- since the repo already has 13 functions over
    // that ceiling; failing the build on them now would block unrelated
    // work. Revisit per function as each is next touched.
    rules: {
      complexity: ['warn', 5],
    },
  },
)
