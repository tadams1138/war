# 12 — Run the production API on one smaller instance

## Summary
Run production's `war-api` App Platform service as one `basic-xs` instance (1 GiB) instead of
two `professional-xs` instances.

## Motivation
Cost: about $24/month down to $10/month (DigitalOcean list prices, checked 2026-11-02). There
are no users yet.

## Behavior
- Production runs a single API instance.
- An instance restart or deploy can briefly interrupt the API. That is accepted:
  `war-spec.md` §12.2 no longer requires zero-downtime deploys (changed 2026-11-02).
- Per-address rate limits are held in each instance's memory, so one instance means one shared
  limit instead of one per instance. No change to configured limits is needed.

## Acceptance criteria
- `war-infra/platform/production.yaml` sets `war-api` to `instance_size_slug: basic-xs` and
  `instance_count: 1`.
- A production deploy succeeds and the smoke test passes.
- Memory alerts stay quiet under normal load, including contestant image uploads (`sharp`).

## Technical notes
- Edit `war-infra/platform/production.yaml` (lines 47–48). Not Terraform: the compute module
  (`war-infra/terraform/modules/compute/main.tf`) has `ignore_changes = [spec]`, so changing its
  bootstrap size does nothing to the running app.
- No code needs Professional-only features: no autoscaling, no dedicated egress IP. Autoscaling
  is out of scope in spec §12.10.
- `basic-xxs` (512 MiB, $5) would save $5 more, but image processing with `sharp` may need more
  memory. Measure before trying it.
- `basic-*` and `professional-*` are DigitalOcean legacy plan names. Confirm in the console that
  the app can still select `basic-xs`, or use the equivalent current size (1 vCPU / 1 GiB).
- Reversal: change the two YAML values and deploy.

## Open questions
- Is 512 MiB (`basic-xxs`) enough? Needs a memory measurement during image uploads.
