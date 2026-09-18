// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'vitest.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Root CLAUDE.md: flag any function's cyclomatic complexity above 5.
      // 'warn' -- not 'error' -- since the repo already has 21 functions
      // over that ceiling; failing the build on them now would block
      // unrelated work. Revisit per function as each is next touched.
      complexity: ['warn', 5],
    },
  },
);
