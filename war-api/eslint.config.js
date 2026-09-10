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
    },
  },
  {
    // Spec §7.9, "Service-Layer Allowlist": a file under src/mcp/tools/ may
    // reach a domain service only through src/mcp/allowedActions.ts -- never
    // directly from one of the six service modules the allowlist would
    // otherwise let it bypass. This is what makes "every MCP tool handler
    // calls only an allowed service function" a structurally visible
    // property (a lint failure) rather than a convention a later edit can
    // silently break. Paired with test/unit/mcpAllowedActions.test.ts, which
    // pins allowedActions.ts's own export set so *that* module can't widen
    // unnoticed either -- this rule alone only stops a handler from reaching
    // *around* it.
    files: ['src/mcp/tools/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/wars/warsService.js',
                '**/contestants/contestantsService.js',
                '**/contestants/mediaService.js',
                '**/votes/votesService.js',
                '**/matchups/matchupsService.js',
                '**/auth/authService.js',
              ],
              message:
                'src/mcp/tools/** may only reach a service function through src/mcp/allowedActions.ts (spec §7.9) -- import it from there instead.',
            },
          ],
        },
      ],
    },
  },
);
