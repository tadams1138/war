# 14 — Move the container registry to the free Starter tier

## Summary
Change the DigitalOcean Container Registry from the `basic` tier ($5/month) to `starter` ($0).

## Motivation
Cost: saves $5/month (DigitalOcean list prices, checked 2026-11-02).

## Behavior
- Starter allows one repository and 500 MiB of storage. The project uses one repository,
  `war-api` (the API and the `bootstrap` image share it).

## Acceptance criteria
- `subscription_tier_slug = "starter"` in `war-infra/terraform/shared/main.tf`.
- The shared infra apply succeeds, and the next staging and production deploys push and pull
  images normally.

## Technical notes
- Edit `war-infra/terraform/shared/main.tf` (`digitalocean_container_registry.war`, around line
  66). Applied by the shared stage of `.github/workflows/infra.yml`.
- DigitalOcean may refuse the downgrade while usage is over 500 MiB.
- Reversal: set the tier back to `basic` and apply; takes effect at once.

## Dependencies
- #13 (prune old images) first, so usage is under 500 MiB and stays there.
