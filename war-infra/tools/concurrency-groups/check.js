#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findSharedGroupViolations } from './lib.js';

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function loadWorkflows(workflowsDir) {
  return readdirSync(workflowsDir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((file) => ({
      file,
      content: readFileSync(path.join(workflowsDir, file), 'utf8'),
    }));
}

const workflowsDir = path.join(repoRoot(), '.github', 'workflows');
const workflows = loadWorkflows(workflowsDir);
const violations = findSharedGroupViolations(workflows);

if (violations.length === 0) {
  console.log(`No shared concurrency groups found across ${workflows.length} workflow files.`);
  process.exit(0);
}

for (const { group, files } of violations) {
  console.log(
    `::error::concurrency group "${group}" is declared by more than one workflow file ` +
      `(${files.join(', ')}). Each pipeline needs its own group — a shared group lets a ` +
      `job queued at an approval gate be silently evicted by the other pipeline's job ` +
      `entering the same group. See specs/war-spec.md.`,
  );
}

process.exit(1);
