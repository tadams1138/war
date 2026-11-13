# Cloudflare edge — per-environment DNS and Worker routing.
# The zone-wide WAF/rate-limit/cache rulesets live in terraform/shared
# instead, applied once — see that module for why.
#
# Media reads private R2 through a binding and caches public variants at the edge.
# Only /api/v1/* reaches App Platform; the default UI is its own Worker
# (terraform/ui).

# Required in every module that uses it, not just the root — Terraform does
# not infer a non-default-namespace provider's source for a child module from
# the root's required_providers alone.
terraform {
  required_version = "~> 1.9"

  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.28" }
  }
}

variable "env" {
  type = string
}

variable "zone_id" {
  type      = string
  sensitive = true
}

variable "account_id" {
  type      = string
  sensitive = true
}

variable "domain" {
  type = string
}

variable "app_default_host" {
  type        = string
  description = "*.ondigitalocean.app hostname; proxied to, never advertised"
}

variable "media_bucket" {
  type = string
}

locals {
  # Paths not matched by a Worker route here fall to the default UI Worker's
  # /* route (terraform/ui), apart from /api/v1/*, which that root keeps on a
  # script-less route so it proxies to App Platform.
  media_worker_name = "war-media-router-${var.env}"
}

# ── DNS ───────────────────────────────────────────────────────────────────────

# Provider v5 renamed cloudflare_record to cloudflare_dns_record; the moved
# block carries the existing record across without recreating it.
moved {
  from = cloudflare_record.apex
  to   = cloudflare_dns_record.apex
}

resource "cloudflare_dns_record" "apex" {
  zone_id = var.zone_id
  name    = var.domain
  type    = "CNAME"
  content = var.app_default_host
  proxied = true
  ttl     = 1 # required when proxied
  comment = "War ${var.env} — proxied to App Platform"
}

# ── Media router Worker ───────────────────────────────────────────────────────
resource "cloudflare_workers_script" "media_router" {
  account_id         = var.account_id
  script_name        = local.media_worker_name
  content            = file("${path.module}/../../../edge/media-router.js")
  main_module        = "media-router.js"
  compatibility_date = "2025-04-02"

  bindings = [{
    type        = "r2_bucket"
    name        = "MEDIA_BUCKET"
    bucket_name = var.media_bucket
  }]
}

resource "cloudflare_workers_route" "media_router" {
  zone_id = var.zone_id
  pattern = "${var.domain}/media/*"
  script  = cloudflare_workers_script.media_router.script_name
}

# WAF, rate limiting, and cache rules live in terraform/shared, not here, one
# zone-wide copy rather than one per environment: staging and production are
# both subdomains of the same Cloudflare zone (one CLOUDFLARE_ZONE_ID, not
# one per env), and Cloudflare permits exactly one custom ruleset per phase
# per zone — a per-environment copy here fails outright on the second
# environment's apply ("A similar configuration with rules already exists...
# overwriting will have unintended consequences"). None of the three key off
# env or domain in their rule expressions (path-only matches throughout), so
# one zone-wide instance changes nothing about what they do — only how many
# of them exist. See terraform/shared/main.tf.

output "media_worker_name" {
  value = cloudflare_workers_script.media_router.script_name
}
