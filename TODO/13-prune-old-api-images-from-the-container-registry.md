# 13 — Prune old API images from the container registry

## Summary
Delete API images that no environment uses, and keep doing so automatically, so the registry
stays small.

## Motivation
The registry holds every `war-api` image ever built. On 2026-11-02 it used 779.56 MiB: 63 tags
and 178 manifests, about 111 MB compressed per image (shared base layers keep the total down).
Moving to the free Starter tier (#14) requires staying under 500 MiB.

## Behavior
- The registry keeps the image each environment runs, one or two older images for rollback, and
  the `bootstrap` tag. Everything else is deleted.
- Garbage collection then frees the storage.
- After each production deploy the pipeline prunes again, so usage does not grow back.

## Acceptance criteria
- Registry usage is under 500 MiB.
- Tags kept: the tag staging runs, the tag production runs, the previous production tag, and
  `bootstrap`.
- A pipeline step prunes old tags after each production deploy, and garbage collection runs
  regularly.
- Staging and production deploys still work after pruning.

## Technical notes
- State on 2026-11-02: staging and production both run tag
  `3ffd743a81195673db0f7096d51027b1f4f67310`; the previous one is
  `0e0be5b25ec22b8a64900cabdd1bd5155e940a9f`. A garbage collection that day freed only 111 KB,
  because every image still had a tag.
- Never delete `bootstrap`: `war-infra/terraform/modules/compute/main.tf` (around line 95) creates
  the app with `repository = "war-api"`, `tag = "bootstrap"`.
- Tags are the git tree hash of `war-api/` (`.github/workflows/app.yml`, around line 505). The
  `ensure-api-image` job skips the build when the tag exists, and rebuilds when it does not, so
  a pruned tag for an unchanged tree is rebuilt, not lost.
- Manual cleanup: `doctl registry repository delete-tag war-api <tag>...`, then
  `doctl registry garbage-collection start war --include-untagged-manifests`.
- Garbage collection puts the registry in read-only mode for a few minutes; pushes fail
  meanwhile. Do not run it while a deploy is building, or put it in the pipeline's concurrency
  group.
- Read the tags in use from `doctl apps spec get <app-id>` for each app rather than assuming.
- Deleting tags is permanent. A deleted image can only be rebuilt from its commit.
- Optional: the image is 284 MB unpacked (`war-api/Dockerfile`, `node:24-alpine` plus
  production `node_modules`). Shrinking it is not needed to fit.
