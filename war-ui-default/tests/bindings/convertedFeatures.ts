// Features executed step by step through playwright-bdd (steps in
// tests/acceptance/steps/) instead of bound by title to a hand-written
// tests/acceptance/<name>.spec.ts. The single list shared by
// playwright.config.ts (which features to generate tests from) and
// featureBindings.ts (which features need no spec file).
export const CONVERTED_FEATURES: string[] = ['create-war', 'import-war', 'theme-switching', 'share-image', 'error-handling', 'my-wars', 'vote-mode-responsive', 'login-and-auth', 'contestant-images', 'vote-mode']
