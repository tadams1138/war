# Pipeline Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the CI/CD workflows, which were inherited from a multi-repo layout, into one monorepo pipeline that builds only what changed, deploys each environment once per release, and stops two pipelines colliding on the same App Platform app.

**Architecture:** `api.yml`, `ui-default.yml` and `openapi-contract.yml` merge into one `app.yml`. A change-detection job gates per-project CI. The API image is tagged by the git tree hash of `war-api/` and built only if that tag is missing from the registry. A single deploy job per environment applies the full app spec, so a newer run that supersedes an older one waiting at the gate always carries the older one's changes. `infra.yml` skips applies when the plan is empty. Phase 2, which moves the default UI off App Platform, starts with a hosting decision before any build work.

**Tech Stack:** GitHub Actions, `dorny/paths-filter`, `rhysd/actionlint`, `doctl`, Docker Buildx, Terraform 1.9.8, bash, envsubst.

**Spec:** `war-spec.md` §12.5 (Pipelines) and §12.9 (Operational constraints). The review that motivates this plan was given in conversation on 2026-10-23; its findings are restated under each task.

## Global Constraints

- Branch from `master` as `ci/consolidate-pipelines`. **Prerequisite:** PR #9 (which adds `AGENTS.md`) is merged first, because Task 4 edits `AGENTS.md`.
- All commands run from the repository root, no `cd` (AGENTS.md "Build and test").
- `NODE_VERSION: '24'` for every repo-internal job. `ui-custom.yml` stays on `'22'`; it builds other repos.
- Docker Hub logins keep the existing 3-attempt retry and fall back to anonymous pulls.
- The explicit envsubst variable list stays load-bearing: `$DATABASE_CA_CERT` in `run_command` must reach the container literally.
- "Production promotes the exact artefact staging validated; it is never rebuilt" (war-spec §12.5) holds for the API image in every task.
- The `production` environment's required reviewer stays the only production gate.
- Commit messages carry no AI attribution trailers (global CLAUDE.md).
- **Testing approach for workflow YAML:** it has no unit-test harness. Each workflow task's "failing test" is either an `actionlint` failure (Task 2 adds the gate) or an observable run on the task's PR, with the expected job results stated as exact `gh run view` output. Shell scripts get real failing tests first.
- Every new `${PLACEHOLDER}` in `war-infra/platform/*.yaml` is UPPER_SNAKE_CASE. Lowercase `${db.X}` bindings belong to App Platform and must never be substituted.

## Review Focus

1. **`workflow_dispatch` with nothing changed:** a manual run must still deploy the commit's full state. Change detection reports every filter as `true` on `workflow_dispatch`; this is tested in Task 3.
2. **A UI-only push when the API image for the current `war-api` tree hash is missing from DOCR** (for example, pruned): the deploy must not reference a missing tag. On push, `ensure-api-image` checks the registry, not the path filter. Tested in Task 3.
3. **A multi-commit push where commit 1 touches `war-api/` and commit 2 touches `war-ui-default/`:** both CI jobs run, because the filter compares the push's `before`..`after` range, not just the last commit. Tested in Task 3.
4. **A placeholder whose secret is unset in the environment:** rendering fails with the variable's name instead of deploying an empty value. Tested in Task 1.
5. **A Terraform plan with no changes:** its apply is skipped, but downstream plans still run, so production drift is still detected. Tested in Task 5.

---

## Phase 1: one app pipeline (recommendation 1, plus the renderer from recommendation 4)

### Task 1: `render-spec.sh`, a single renderer that derives its own variable list

Replaces the two copied 13-variable `envsubst` blocks in `api.yml`. The variable list is derived from the template, so a newly added placeholder can no longer silently render empty.

**Files:**
- Create: `war-infra/scripts/render-spec.sh` (mode 100755)
- Create: `war-infra/scripts/render-spec.test.sh` (mode 100755)
- Modify: `war-infra/platform/staging.yaml:9-14` and `war-infra/platform/production.yaml:9-14` (header comment: the renderer, and that the image tag is the `war-api` tree hash, not the commit SHA)

**Interfaces:**
- Produces: `war-infra/scripts/render-spec.sh <template> <output>`. Exit 0 on success. Exit 1 with `render-spec: <NAME> is unset or empty` on stderr for each missing variable; in that case no output file is written. Exit 2 with usage when an argument is missing.

- [ ] **Step 1: Write the failing tests** in `render-spec.test.sh`. It is plain bash with a `check <name> <command>` helper, and it exits non-zero if any case fails. Each case writes a fixture template to `mktemp -d`:
  - `substitutes_upper_placeholders`: template `tag: ${IMAGE_TAG}` with `IMAGE_TAG=abc` → output is exactly `tag: abc`.
  - `leaves_bare_dollar_vars`: template `echo "$DATABASE_CA_CERT"` with `DATABASE_CA_CERT=x` set → output is unchanged.
  - `leaves_platform_bindings`: template `value: ${db.DATABASE_URL}` → output is unchanged.
  - `fails_naming_empty_var`: template `a: ${FOO}` and `b: ${BAR}` with `FOO=1` and `BAR=` → exit 1, stderr contains `render-spec: BAR is unset or empty`, and the output file does not exist.
  - `renders_real_templates_completely`: for each of `war-infra/platform/staging.yaml` and `production.yaml`, set every placeholder found to `dummy` and render. The output contains no `${[A-Z]` match and still contains `"$DATABASE_CA_CERT"`.
- [ ] **Step 2: Run the tests to verify they fail.** Run `bash war-infra/scripts/render-spec.test.sh`. Expected: every case FAILs because `render-spec.sh` does not exist.
- [ ] **Step 3: Implement `render-spec.sh`.** Use `set -euo pipefail`. Build the list with `grep -oE '\$\{[A-Z][A-Z0-9_]*\}' "$template" | sort -u`. Check each name with `${!name:-}`. Collect every missing name before exiting, so all of them are reported. Then call `envsubst "$list"`, writing to a temp file that is moved into place.
- [ ] **Step 4: Run the tests to verify they pass.** Run `bash war-infra/scripts/render-spec.test.sh`. Expected: all 5 `ok`, exit 0.
- [ ] **Step 5: Set the executable bit in git.** Run `git update-index --chmod=+x war-infra/scripts/render-spec.sh war-infra/scripts/render-spec.test.sh`, then `git ls-files -s war-infra/scripts/` should show `100755` for both.
- [ ] **Step 6: Commit:** `ci: render app specs with a variable list derived from the template`

### Task 2: actionlint gate, replacing the concurrency-group guard

The guard exists only because two workflows deploy one app, and Task 3 removes that situation. A general workflow linter catches more failures before merge.

**Files:**
- Create: `.github/workflows/workflows.yml`
- Delete: `.github/workflows/concurrency-groups.yml`, `war-infra/tools/concurrency-groups/` (whole directory)

**Interfaces:**
- Produces: a check named `actionlint`, triggered on `pull_request` and `push` to `master` for `paths: ['.github/workflows/**']`, plus `workflow_dispatch`. It runs `rhysd/actionlint` pinned to a release tag. Look up the current one with `gh release list -R rhysd/actionlint --limit 1`. Enable its shellcheck integration.

- [ ] **Step 1: Write the failing check.** Create `workflows.yml`, then run actionlint locally over the current workflows: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:<tag> -color`. Record every finding. Expected: findings exist (at minimum, shellcheck notes in inline `run:` blocks). This is the red state.
- [ ] **Step 2: Fix each finding** in the existing workflows. Change only quoting or expression syntax; behaviour must not change.
- [ ] **Step 3: Re-run actionlint.** Expected: no output, exit 0.
- [ ] **Step 4: Delete the guard workflow and tool.** Remove the "war-infra tools" section from `AGENTS.md` (lines 90-97). Update the references at `README.md:52,198-199,221`, `war-infra/README.md:158` and `PROGRESS.md:208` to name `workflows.yml` / actionlint.
- [ ] **Step 5: Commit:** `ci: lint workflows with actionlint; drop the concurrency-group guard`

### Task 3: `app.yml`, one pipeline with change detection and one deploy per environment

**Files:**
- Create: `.github/workflows/app.yml`
- Delete: `.github/workflows/api.yml`, `.github/workflows/ui-default.yml`, `.github/workflows/openapi-contract.yml`

**Interfaces:**
- Consumes: `war-infra/scripts/render-spec.sh` (Task 1).
- Produces these jobs, which branch protection and the docs name:
  - `changes`: outputs `api`, `ui`, `contract`, `deploy` (each `'true'`/`'false'`).
  - `api-ci`, `ui-ci`, `contract`, `ensure-api-image`, `deploy-staging`, `deploy-production`.
  - The image tag is `api_tag = $(git rev-parse HEAD:war-api)`, emitted as an output by `ensure-api-image`.

**Triggers:** `push` and `pull_request` to `master`, plus `workflow_dispatch`. Workflow-level `paths` is the union of everything that can change the app:
`war-api/**`, `!war-api/**/*.md`, `!war-api/specs/features/pending/**`, `war-ui-default/**`, `!war-ui-default/**/*.md`, `!war-ui-default/features/pending/**`, `war-infra/platform/**`, `war-infra/scripts/**`, `.github/workflows/app.yml`.

**Job rules (the decisions):**
- `changes` uses `dorny/paths-filter@v3` with `predicate-quantifier: 'every'`:
  - `api`: the war-api patterns above.
  - `ui`: the war-ui-default patterns above.
  - `contract`: `api` OR `war-ui-default/src/api/generated/**` OR `war-ui-default/package.json`.
  - `scripts`: `war-infra/scripts/**`.
  - `workflow`: `.github/workflows/app.yml`.

  On `workflow_dispatch`, or when `workflow` matched, every output is forced to `'true'`.
- `api-ci`: the body of the current `api.yml` `ci` job, unchanged. It runs `if: needs.changes.outputs.api == 'true'`.
- `ui-ci`: the body of the current `ui-default.yml` `ci` job, plus a Playwright browser cache (Task 7 owns that step; leave a placeholder comment). It runs `if: ui`.
- `contract`: the body of `openapi-contract.yml`. It runs `if: contract`.
- `scripts-test`: runs `bash war-infra/scripts/render-spec.test.sh` and `if: scripts`.
- `ensure-api-image` runs with no `needs`, in parallel with CI.
  - **On `pull_request`:** runs only `if: api`, builds without pushing.
  - **On push and dispatch:** always runs. It logs in to DOCR, computes `api_tag`, and runs `docker buildx imagetools inspect $REGISTRY/$IMAGE_NAME:$api_tag`. On exit 0 it skips the build and only emits the tag. Otherwise it builds and pushes with the GHA cache as today.
  - **The push is not gated on CI.** It runs as soon as the build finishes, and `deploy-staging` needs both `ensure-api-image` and the CI jobs. An image pushed for a commit whose CI later fails is harmless, because no deploy references it.
- `deploy-staging`:
  - `needs: [changes, api-ci, ui-ci, contract, scripts-test, ensure-api-image]`.
  - `if: github.event_name != 'pull_request' && !cancelled() && !contains(needs.*.result, 'failure')`.
  - `environment: staging`. Concurrency is `group: deploy-staging`, `cancel-in-progress: false`.
  - Steps: render with `IMAGE_TAG=${{ needs.ensure-api-image.outputs.api_tag }}` and every secret env var from today's job → `doctl apps update --spec --wait` → Cloudflare purge (today's `ui-default.yml` step) → `smoke-test.sh staging api` → `smoke-test.sh staging ui-default`.
- `deploy-production`: same steps against `production.yaml`. It needs `deploy-staging` and the `production` environment. Concurrency is `group: deploy-production`, `cancel-in-progress: false`. Write a comment there explaining why superseding is now safe: every run deploys the full state of its commit, and only one workflow writes to the app.

- [ ] **Step 1: Write `app.yml` and delete the three old workflows.**
- [ ] **Step 2: Run actionlint.** Command as in Task 2. Expected: exit 0.
- [ ] **Step 3: Open the PR with a UI-only test commit.** Touch a comment in `war-ui-default/src/main.tsx`, then run `gh run view <id> --json jobs --jq '.jobs[]|"\(.name): \(.conclusion)"'`. Expected: `ui-ci: success`, `api-ci: skipped`, `contract: skipped`, `ensure-api-image: skipped`, and both deploys `skipped` (it's a PR).
- [ ] **Step 4: Push an API-only test commit** that touches a comment in `war-api/src/server.ts`. Expected: `api-ci: success`, `contract: success`, `ensure-api-image: success`, `ui-ci: skipped`.
- [ ] **Step 5: Run a workflow-file-only change.** It is already in the PR, so the first run shows this. Expected: every CI job runs.
- [ ] **Step 6: Revert the two test comments** and commit.
- [ ] **Step 7: After merge, verify one release.** `gh run list --workflow app.yml --limit 1` shows one run with a single `deploy-production` waiting at the gate. The rendered `IMAGE_TAG` in the staging deploy log equals `git rev-parse origin/master:war-api`.
- [ ] **Step 8: Verify the missing-image case (Review Focus 2).** Use `gh workflow run app.yml --ref master` after confirming the tag exists. Expected: `ensure-api-image` logs "image exists, skipping build" and finishes in under 1 minute.
- [ ] **Step 9: Commit:** `ci: one app pipeline with change detection and one deploy per environment`

### Task 4: Spec, docs and pending Gherkin

**Files:**
- Modify: `war-spec.md` §12.5 (lines 1370-1384) and §12.9 (lines 1457-1459)
- Modify: `war-infra/specs/features/pending/routing.feature` (the "Concurrency Group Isolation" feature at lines 154-172, and "CI/CD Pipelines" at 114-152)
- Modify: `AGENTS.md`, `README.md`, `war-infra/README.md`, `PROGRESS.md`

- [ ] **Step 1: Rewrite §12.5's opening.** "The API and default UI share one application pipeline that detects which project changed and runs only that project's checks; infrastructure and custom UIs have their own." The API stage list gains "build image only when its source changed". The UI line drops "deploy" as a separate stage: the app's deploy carries both.
- [ ] **Step 2: Replace the §12.9 concurrency bullet.** "One pipeline writes to the application per environment. A newer release supersedes one still waiting at the production gate; that is safe because every deploy carries the full state of its commit."
- [ ] **Step 3: Update the pending Gherkin.** Replace the Concurrency Group Isolation feature with these scenarios: "A UI-only change does not rebuild the API image", "A newer release supersedes one waiting at the production gate", "A manual run deploys the full state of the commit". In "API deploy pipeline runs all stages on merge to master", change the image step to the tree-hash tag.
- [ ] **Step 4: Update the docs.** `README.md` workflow table: replace the api / ui-default / openapi-contract / concurrency-groups rows with `app.yml` and `workflows.yml`. `PROGRESS.md`: record what shipped. `war-infra/README.md`: update the deploy runbook. Use `gh workflow run app.yml` instead of the per-project workflows.
- [ ] **Step 5: Verify.** Run `git grep -nE 'api\.yml|ui-default\.yml|openapi-contract\.yml|concurrency-groups'`. Expected: no matches outside `docs/superpowers/` and git history.
- [ ] **Step 6: Commit:** `docs: describe the single app pipeline`

**User action after merge:** if any required status checks are later added for `master`, name them from Task 3's job list. Old check names (`CI` in two workflows) disappear.

---

## Phase 2: default UI off App Platform (recommendation 2), decision first

**Why it is gated:** the edge worker is bound to `/ui/*` on purpose, so that per-request Worker quota is spent on custom-UI traffic only (`war-infra/terraform/modules/edge/main.tf:115`). Serving the default UI from storage puts a Worker in front of every page load. `og-tags-router.js` also fetches the UI shell from the same origin. Until those two questions are answered, the build tasks can't be written precisely.

### Task 9: Hosting decision (spike, no production change; can run in parallel with Phases 3-4)

- [ ] **Step 1: Write a decision note** in `docs/superpowers/specs/2026-10-xx-default-ui-hosting.md`. It compares:
  - **(A) Spaces plus a Worker bound to `/*`,** with Worker-less routes for `/api/v1/*` and `/media/*`.
  - **(B) Cloudflare Workers static assets** (`not_found_handling = "single-page-application"`). Static-asset requests aren't billed as Worker invocations; verify that against current Cloudflare docs.
  - **(C) Stay on App Platform** and accept the remaining issues.

  For each option, record: the invocation cost at current traffic; how `og-tags-router` gets the shell; how SPA deep links return 200; Terraform resources added and removed; and the rollback path.
- [ ] **Step 2: Bring the note to the user for a decision.** Phase 2 build tasks get written against the chosen option.

Whatever the choice, these follow (written in detail once Task 9 is decided):
- UI built once in `ui-ci` with no `VITE_API_BASE_URL`; `client.ts` already falls back to `/api/v1`.
- The build uploaded as an artifact keyed by `git rev-parse HEAD:war-ui-default` and promoted unchanged to production.
- `static_sites` removed from `platform/*.yaml`, plus the ingress rules for `/` and `/ui/default`.
- war-spec §12 role table: "Application platform: runs the API". Default-UI hosting moves to the role that serves it.

---

## Phase 3: `infra.yml` (recommendation 3)

### Task 5: Narrower trigger, apply only when the plan has changes, pinned tflint

**Files:**
- Modify: `.github/workflows/infra.yml`

**Interfaces:**
- Produces: each `plan-*` job outputs `changes: 'true'|'false'` from `terraform plan -detailed-exitcode` (2 → true, 0 → false, anything else fails the job).

**Decisions:**
- **Paths:** add `!war-infra/tools/**`, `!war-infra/scripts/**`, `!war-infra/specs/**` and `!war-infra/bootstrap/**`. Keep `war-infra/edge/**`: Terraform reads the Worker sources via `file()`.
- **Concurrency:** remove `concurrency` from all three `plan-*` jobs, because plans are read-only. Keep it on the `apply-*` jobs.
- **Applies:**
  - Each `apply-*` job adds `&& needs.plan-<env>.outputs.changes == 'true'`.
  - `apply-staging` becomes `if: github.event_name == 'push' && !cancelled() && needs.plan-staging.outputs.changes == 'true' && needs.apply-shared.result != 'failure'`.
  - `plan-production` becomes `if: github.event_name == 'push' && !cancelled() && !contains(needs.*.result, 'failure')`. It still runs after a skipped staging apply, so production drift is detected.
- **tflint:** pin `tflint_version` to the release from `gh release list -R terraform-linters/tflint --limit 1`.
- Add `workflow_dispatch`.
- **`apply-shared` gate (decided 2026-10-23: gated):** `apply-shared` gets `environment: infra-shared`. That GitHub Environment, with the repo owner as required reviewer, is created before this task merges. A comment on the job explains why: shared resources (zone settings, WAF/rate-limit rules, registry) reach production without a staging pass first.

- [ ] **Step 1: Run actionlint on the edited file.** Expected: exit 0.
- [ ] **Step 2: Verify on the PR** with a no-op commit that touches a comment in `war-infra/terraform/envs/staging/main.tf`. Expected: `Validate: success` and `Plan → Shared: success`. The staging plan job log shows `changes=false`.
- [ ] **Step 3: Verify the path exclusion.** A commit touching only `war-infra/scripts/smoke-test.sh` starts no `war-infra Pipeline` run (check with `gh run list --workflow infra.yml --limit 1`).
- [ ] **Step 4: After merge, verify the push run.** It shows `Apply → Staging: skipped` and `Apply → Production: skipped`, `Plan → Production: success`, and no approval request.
- [ ] **Step 5: Commit:** `ci(infra): apply only when the plan changes; plans no longer queue`

---

## Phase 4: smaller fixes (recommendation 4, minus the renderer done in Task 1)

### Task 6: `ui-custom.yml` artifact retention

- [ ] **Step 1:** In `.github/workflows/ui-custom.yml:131`, change `retention-days: 1` to `retention-days: 30`. Add a comment explaining why: production downloads this artifact after approval, so it must outlive the wait for approval.
- [ ] **Step 2:** Run actionlint. Expected: exit 0.
- [ ] **Step 3: Commit:** `ci(ui-custom): keep the build until production can promote it`

### Task 7: Playwright browser cache in `ui-ci`

- [ ] **Step 1:** In `app.yml` `ui-ci`, read the Playwright version with `npm --prefix war-ui-default ls @playwright/test --json` and set it as a step output.
- [ ] **Step 2:** Add `actions/cache` on `~/.cache/ms-playwright`, keyed `playwright-${{ runner.os }}-<version>`.
  - **On a hit:** run `npx playwright install-deps chromium`.
  - **On a miss:** run `npx playwright install --with-deps chromium`.
- [ ] **Step 3: Verify on the second PR run.** `gh run view --log` for `ui-ci` shows `Cache restored from key: playwright-Linux-` and an install step under 30 s.
- [ ] **Step 4: Commit:** `ci(ui): cache Playwright browsers`

### Task 8: Action major versions

- [ ] **Step 1:** For each action in use (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `actions/download-artifact`, `actions/cache`, `docker/setup-buildx-action`, `docker/build-push-action`, `hashicorp/setup-terraform`, `digitalocean/action-doctl`, `terraform-linters/setup-tflint`, `dorny/paths-filter`), find the latest major with `gh release list -R <owner/repo> --limit 1`. Update every workflow to it. `push-bootstrap-image.yml` moves from `build-push-action@v5` to the same major as `app.yml`.
- [ ] **Step 2:** Read each bumped action's release notes for breaking input changes, especially `upload-artifact` and `download-artifact`, whose names and merge rules changed between majors. Adjust inputs to match.
- [ ] **Step 3:** Run actionlint. Expected: exit 0. Then check the PR run: no `Node.js 20 is deprecated` warnings (`gh run view <id> --log | grep -c "Node.js 20 is deprecated"` prints 0).
- [ ] **Step 4: Commit:** `ci: bump actions to current majors`
