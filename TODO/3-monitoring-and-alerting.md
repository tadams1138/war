# 3 — Monitoring and alerting

## Summary
Add operational monitoring beyond the App Platform alerts. War-spec.md §12.7 describes the
built signals and the remaining planned work.

## Current state
The App Platform app alerts on CPU, memory, restart count, failed deployment and failed
domain (README "Alerts"). Terraform also declares shared database CPU, memory and disk
alerts above 80% over 5 minutes, and one public scheduled-task health check per environment
with down (2 minutes), latency (above 2000 ms for 5 minutes) and certificate-expiry
(within 14 days) alerts. These email the repository's ALERT_EMAIL DigitalOcean team address.
The check polls `GET /api/v1/health/scheduled-tasks`, which combines API/database
availability with recent nightly-job success (spec §12.8 "Watchdog signal").
Error-rate, request p99, unhandled-exception, connection-pool and edge-spike alerts, plus
scheduled-run retries, remain planned.

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
- Keep README "Alerts" and "Scheduled tasks" up to date as remaining monitoring ships.

## Open questions
- Tooling (error tracker; source of latency and error-rate metrics) is not decided.
