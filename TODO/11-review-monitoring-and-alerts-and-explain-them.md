# 11 — Review monitoring and alerts, and explain them

## Summary
Review every monitoring signal and alert the platform has today, confirm each one works,
and write a plain explanation of what is watched, what triggers an email, and what to do
when one arrives.

## Motivation
Monitoring was added in pieces (App Platform alerts, DigitalOcean's default database
alerts, the Terraform database alerts and uptime checks from PR #36 and #37, the nightly
watchdog endpoint). The owner wants one clear picture of what is going on rather than
facts scattered across the README, the spec and Terraform.

## Behavior
The outcome is an explanation, for the owner, covering for each signal:
- what it watches and where it is defined (App Platform spec, Terraform, DigitalOcean default);
- the threshold and window that trigger it;
- who is notified and how (email to `ALERT_EMAIL`, or the DigitalOcean account email);
- what a firing alert most likely means and the first thing to check;
- whether it has actually fired or been verified since it was created.

## Acceptance criteria
- Every alert in the DigitalOcean control panel (Monitoring, Uptime, database and app
  alerts) is accounted for, including DigitalOcean's default 90% database alerts.
- The uptime checks for staging and production show up after the first nightly run, and
  the watchdog endpoint returns 200 in both environments.
- Any alert that never fires correctly, or duplicates another, is fixed or removed.
- The explanation lives in the README "Alerts" section (or the operations runbook, if
  that split happens), short enough to read during an incident.

## Technical notes
- App alerts: `war-infra/platform/{staging,production}.yaml` (`alerts:` blocks).
- Database alerts: `war-infra/terraform/shared/main.tf` (`digitalocean_monitor_alert.*`).
- Uptime check and alerts: `war-infra/terraform/modules/monitoring/main.tf`.
- Watchdog endpoint: `war-api/src/health/routes.ts` (`GET /api/v1/health/scheduled-tasks`, 49-hour threshold).
- Nightly job: `war-infra/edge/scheduled-tasks.js` (Cloudflare Cron Worker).
- The local doctl token returned 403 on `/v2/monitoring/alerts`; reading alerts may need
  a token with `monitoring:read` and `uptime:read`.

## Dependencies
- Related to #3 (the monitoring still to build). This item reviews what exists; #3 adds more.

## Open questions
- Should DigitalOcean's default 90% database alerts stay alongside the Terraform 80% ones,
  or be removed to avoid double emails?
