# 3 — Monitoring and alerting

## Summary
Add operational monitoring beyond the App Platform alerts. War-spec.md §12.7 describes the
target state (marked Planned).

## Current state
The App Platform app alerts on CPU, memory, restart count, failed deployment and failed
domain (README "Alerts"). Nothing else.

## Acceptance criteria
- Error tracking is in place for the API (and the UI if appropriate).
- Latency and error-rate alerts exist.
- An alert fires on a failed scheduled run.
- A failed scheduled run is retried.

## Technical notes
- Scheduled run: `war-infra/edge/scheduled-tasks.js` (Cron Worker, nightly) calls
  `POST /api/v1/internal/close-expired-wars` with `INTERNAL_TASK_TOKEN` (`x-internal-token`
  header). On failure the Worker throws, which marks the invocation failed in Cloudflare.
  Terraform: `war-infra/terraform/modules/scheduler`. Why a failure is not an outage: spec §12.8.
- App Platform alerts are declared in `war-infra/platform/{staging,production}.yaml`.
- API logging is in `war-api/src/logging.ts`.
- After building, update README "Alerts" and "Scheduled tasks", which currently say alerting
  beyond this is not built.

## Open questions
- Tooling (error tracker; source of latency and error-rate metrics) is not decided.
