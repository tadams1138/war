# 11 — Move object storage from Spaces to Cloudflare R2

## Summary
Move every DigitalOcean Spaces bucket (Terraform state, media, custom UIs) to Cloudflare R2,
then delete the last Spaces bucket so the Spaces subscription stops billing.

## Motivation
- Cost: Spaces is a flat $5/month for the account and stops billing only when every bucket is
  deleted. R2 is free under 10 GB-month of storage, 1M Class A and 10M Class B operations a
  month, with free egress. Saves about $60/year if total data stays under 10 GB.
- Terraform state locking: R2 supports atomic conditional writes (`If-None-Match`), which the
  S3 backend's `use_lockfile` relies on. Today Spaces has no locking and the per-environment
  concurrency groups in `.github/workflows/infra.yml` stand in for it.
- One fewer hop and vendor on the media path: the edge Workers already run on Cloudflare and
  could read R2 through a binding instead of fetching from the DigitalOcean CDN.

Sources (checked 2026-11-11):
- https://docs.digitalocean.com/products/spaces/details/pricing/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/r2/api/s3/api/

## Behavior
No change visible to voters or creators:
- Contestant image variants keep loading from `https://<host>/media/contestants/...`.
- Image originals stay private and are never served (the WAF rule on `/media/originals/*`
  stays).
- Custom UI hosting is removed until the registry and shared runtime are built.
- Uploads, reprocessing and deletion of contestant images keep working.

## Acceptance criteria
- Uploading a contestant image stores its original and variants in R2; the variants are
  served at the same public URLs as before; the original is not reachable from the internet.
- Deleting a contestant or War removes its objects from R2.
- The existing war-api image-processing and storage tests pass against an S3-compatible mock
  without the `ACL` parameter.
- `terraform plan` is clean for shared, staging, production and ui with state stored in R2.
- Two overlapping `terraform apply` runs on one state fail fast on the lock instead of both
  writing (if `use_lockfile` is adopted).
- No `digitalocean_spaces_bucket` or `digitalocean_cdn` resource remains, and the
  DigitalOcean billing page shows no Spaces subscription.
- SPEC.md and the README's "Deployment and operations" section describe R2 as the store.

## Technical notes
Current Spaces use (region `nyc3`):
- `war-tfstate`: S3 backend for `terraform/shared`, `envs/staging`, `envs/production`,
  `terraform/ui` (backend blocks use `endpoints = { s3 = "https://nyc3.digitaloceanspaces.com" }`).
- `war-media-{env}` and `war-ui-custom-{env}`: `war-infra/terraform/modules/storage/main.tf`,
  each with a `digitalocean_spaces_bucket_policy` and a `digitalocean_cdn`.
- `modules/edge` binds `MEDIA_CDN_ORIGIN` and `STORAGE_CDN_ORIGIN` (the DO CDN hosts) into
  the media-router and ui-router Workers.
- war-api: `war-api/src/contestants/storage.ts` (AWS SDK v3, `forcePathStyle` when an
  endpoint is set); config in `war-api/src/config.ts` (`S3_ENDPOINT`, `S3_REGION` default
  `us-east-1`, `S3_BUCKET`, credentials).
- Credentials: `SPACES_ACCESS_KEY_ID` / `SPACES_SECRET_ACCESS_KEY` secrets feed both the state
  backend (`AWS_*` in `infra.yml` and `app.yml`) and the app spec's `S3_*` keys via
  `war-infra/scripts/render-spec.sh`.

R2 differences that force changes:
- `x-amz-acl` on PutObject is unsupported. `storage.ts:45` sets `ACL: 'public-read'` on
  variants; remove it, test first (unit test asserting the command carries no ACL).
- No bucket policies, so the "variants public, originals private" split cannot be a
  per-prefix policy. Options:
  - Keep the media bucket private and serve only `contestants/*` through an R2 binding in
    the media-router Worker (preferred; the binding never exposes `originals/`).
  - Split originals into a separate private bucket (code change in `storage.ts`).
- Region is `auto` (`S3_REGION=auto`); endpoint
  `https://<account_id>.r2.cloudflarestorage.com`.
- Terraform: `cloudflare_r2_bucket` (provider `cloudflare/cloudflare ~> 5.28`, already used),
  R2 Worker bindings in `modules/edge`, remove `digitalocean_cdn`.
- `use_lockfile` needs Terraform >= 1.10; `TF_VERSION` is `1.9.8` in both workflows and
  `required_version = "~> 1.9"` in every root. Bump both.

Migration outline:
1. Create R2 buckets and an R2 API token (state, media, ui-custom per env).
2. Copy data (`rclone sync` or `aws s3 sync` with both endpoints); verify object counts.
3. Move state: change each backend block, `terraform init -migrate-state` per root.
4. Switch app config and Worker bindings per environment, staging first. Downtime is
   acceptable (no users yet).
5. Delete Spaces buckets and the DO CDN endpoints; confirm Spaces billing stops.

Risks:
- More Cloudflare concentration: one outage or free-tier change now hits edge and storage.
- Free tier covers Standard storage only; Infrequent Access has a 30-day minimum and
  retrieval fees, so stay on Standard.
- Whether a Worker binding read counts as a Class B operation is not stated on the pricing
  page; at war's traffic it is inside the free 10M either way.

## Dependencies
- Best done together with #9 (orphaned storage objects), since both touch `storage.ts` and
  the media bucket.
- #1 (custom UI registry) reads the ui-custom bucket; keep its design in step with the move.

## Decisions
- The ui-custom buckets are not needed yet. They, their CDN endpoints, the ui-router Worker
  and route, the `ui-custom.yml` pipeline and the custom UI smoke checks are removed; #1
  rebuilds them on R2 when custom UIs are built.
- Media buckets stay private. The media-router Worker reads them through an R2 binding and
  serves only `contestants/*` keys, so originals are unreachable even without the WAF rule.
- Spaces resources leave Terraform state through `removed` blocks with `destroy = false`.
  The buckets and CDN endpoints are deleted by hand after the data copy is verified.
- The state backend moves last, in its own change, with the Terraform version bump.

## Progress
- Code and Terraform now target private R2 media buckets; the API omits unsupported ACLs,
  and the media Worker restricts reads to variants with conditional requests and edge caching.
- Custom UI hosting, pipeline and smoke checks are removed; rebuild details are in #1.
- App configuration uses R2 credentials and account endpoints. README includes the manual
  copy, verification and cleanup runbook.
- Local checks: API lint/typecheck and isolated storage unit test pass; edge, shell and
  infrastructure regressions and all four Terraform validations pass. Standard API tests
  cannot start because this session cannot access Docker's named pipe.
- Still pending: infrastructure apply, R2 token/secrets, object copy and count verification,
  app redeploy, live URL checks, manual deletion of old media/custom UI storage, and the
  separate state-backend migration/version bump. No infrastructure or state was changed live.

## Open questions
- Current total size of all buckets (decides whether R2 stays free). Check with
  `aws s3 ls s3://<bucket> --recursive --summarize --endpoint-url https://nyc3.digitaloceanspaces.com`.
- Does Terraform's S3 `use_lockfile` work on R2 in practice? Unverified; test on staging state.

## Out of scope
- Moving the container registry (DOCR) or the database.
- Changing image variant sizes or the upload pipeline beyond removing the ACL.
