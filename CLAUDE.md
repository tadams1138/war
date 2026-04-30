# war-ui-default

## Commit messages
Do not include a "Co-Authored-By" footer or any indication that Claude wrote the commit.

## Development
Always use Test Driven Development. Prefer BDD-style acceptance tests over unit tests. Never write production code without first having a failing acceptance test or failing unit test.

Red-Green-Refactor cycle:
1. Write a single failing test (acceptance test preferred; unit test where acceptance is not practical)
2. Write only enough production code to make the test pass
3. Refactor
4. Repeat until there are no more tests to write

Guidance by test type:
- **Acceptance tests** (Playwright): preferred for user-facing behaviour — page loads, navigation, voting interactions, error states
- **Unit tests** (Vitest): use for `api/client.ts` logic (401 retry, error mapping) and any pure functions; not for React components that only render API data