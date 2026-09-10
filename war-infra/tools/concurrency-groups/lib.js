import yaml from 'js-yaml';

/**
 * Returns the literal concurrency.group value declared directly on a single
 * workflow or job node, or undefined if that node declares none. Never
 * evaluates a GitHub Actions expression (`${{ ... }}`) — the raw string is
 * returned as-is, exactly as it appears in the file.
 */
function groupOf(node) {
  if (!node || typeof node !== 'object') return undefined;
  const { concurrency } = node;
  if (!concurrency || typeof concurrency !== 'object') return undefined;
  return typeof concurrency.group === 'string' ? concurrency.group : undefined;
}

/**
 * Extracts every literal concurrency.group value declared anywhere in one
 * workflow file's parsed document — its own top-level concurrency block, if
 * any, plus each job's concurrency block, if any.
 */
export function extractGroups(content) {
  const doc = yaml.load(content);
  if (!doc || typeof doc !== 'object') return [];

  const groups = [];

  const topLevel = groupOf(doc);
  if (topLevel !== undefined) groups.push(topLevel);

  const jobs = doc.jobs;
  if (jobs && typeof jobs === 'object') {
    for (const job of Object.values(jobs)) {
      const jobGroup = groupOf(job);
      if (jobGroup !== undefined) groups.push(jobGroup);
    }
  }

  return groups;
}

/**
 * Finds every concurrency.group name declared, as a literal string, by two
 * or more *different* workflow files. A group repeated across jobs within a
 * single file is not a violation — that is one pipeline serialising its own
 * jobs against itself (e.g. infra.yml's terraform-shared/staging/production
 * plan+apply pairs), an unrelated, legitimate pattern this guard must not
 * flag. See war-infra/specs/features/pending/routing.feature,
 * "Feature: Concurrency Group Isolation".
 *
 * @param {{file: string, content: string}[]} workflows
 * @returns {{group: string, files: string[]}[]}
 */
export function findSharedGroupViolations(workflows) {
  const filesByGroup = new Map();

  for (const { file, content } of workflows) {
    const groupsInThisFile = new Set(extractGroups(content));
    for (const group of groupsInThisFile) {
      if (!filesByGroup.has(group)) filesByGroup.set(group, new Set());
      filesByGroup.get(group).add(file);
    }
  }

  const violations = [];
  for (const [group, files] of filesByGroup) {
    if (files.size > 1) {
      violations.push({ group, files: [...files].sort() });
    }
  }

  return violations.sort((a, b) => a.group.localeCompare(b.group));
}
