import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findSharedGroupViolations } from './lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Repository root is four levels up from war-infra/tools/concurrency-groups/.
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');

function readWorkflow(file) {
  return { file, content: readFileSync(path.join(workflowsDir, file), 'utf8') };
}

describe('findSharedGroupViolations', () => {
  // Arrange
  it('flags the same literal concurrency.group declared by two different workflow files', () => {
    const workflows = [
      {
        file: 'a.yml',
        content: `
jobs:
  deploy-staging:
    concurrency:
      group: deploy-staging
      cancel-in-progress: false
`,
      },
      {
        file: 'b.yml',
        content: `
jobs:
  deploy-staging:
    concurrency:
      group: deploy-staging
      cancel-in-progress: false
`,
      },
    ];

    // Act
    const violations = findSharedGroupViolations(workflows);

    // Assert
    expect(violations).toEqual([
      { group: 'deploy-staging', files: ['a.yml', 'b.yml'] },
    ]);
  });

  it('does not flag a single workflow file serialising its own jobs against each other', () => {
    // Arrange — mirrors infra.yml's plan-shared/apply-shared pair, which
    // deliberately share one group within the same file.
    const workflows = [
      {
        file: 'infra.yml',
        content: `
jobs:
  plan-shared:
    concurrency:
      group: terraform-shared
      cancel-in-progress: false
  apply-shared:
    concurrency:
      group: terraform-shared
      cancel-in-progress: false
  plan-staging:
    concurrency:
      group: terraform-staging
      cancel-in-progress: false
`,
      },
    ];

    // Act
    const violations = findSharedGroupViolations(workflows);

    // Assert
    expect(violations).toEqual([]);
  });

  it('ignores workflow files with no concurrency block at all', () => {
    // Arrange
    const workflows = [
      { file: 'ci.yml', content: 'jobs:\n  build:\n    runs-on: ubuntu-latest\n' },
    ];

    // Act
    const violations = findSharedGroupViolations(workflows);

    // Assert
    expect(violations).toEqual([]);
  });

  it('does not flag group names that are merely similar, not byte-identical', () => {
    // Arrange
    const workflows = [
      {
        file: 'api.yml',
        content: `
jobs:
  deploy-production:
    concurrency:
      group: deploy-production-api
`,
      },
      {
        file: 'ui-default.yml',
        content: `
jobs:
  deploy-production:
    concurrency:
      group: deploy-production-ui
`,
      },
    ];

    // Act
    const violations = findSharedGroupViolations(workflows);

    // Assert
    expect(violations).toEqual([]);
  });

  it('reads a top-level workflow concurrency block as well as job-level ones', () => {
    // Arrange
    const workflows = [
      {
        file: 'a.yml',
        content: `
concurrency:
  group: shared-name
jobs:
  build:
    runs-on: ubuntu-latest
`,
      },
      {
        file: 'b.yml',
        content: `
jobs:
  build:
    concurrency:
      group: shared-name
`,
      },
    ];

    // Act
    const violations = findSharedGroupViolations(workflows);

    // Assert
    expect(violations).toEqual([{ group: 'shared-name', files: ['a.yml', 'b.yml'] }]);
  });

  // Real-file regression: exercises the guard against this repository's own
  // workflow files rather than only fixtures, per the delivered state
  // described in war-infra/specs/features/pending/routing.feature,
  // "Feature: Concurrency Group Isolation", scenario "The api and ui-default
  // pipelines no longer share a group".
  it('finds no shared groups across this repository\'s actual workflow files', () => {
    // Arrange
    const workflows = [
      readWorkflow('api.yml'),
      readWorkflow('ui-default.yml'),
      readWorkflow('ui-custom.yml'),
      readWorkflow('infra.yml'),
      readWorkflow('openapi-contract.yml'),
      readWorkflow('push-bootstrap-image.yml'),
      readWorkflow('concurrency-groups.yml'),
    ];

    // Act
    const violations = findSharedGroupViolations(workflows);

    // Assert
    expect(violations).toEqual([]);
  });
});
