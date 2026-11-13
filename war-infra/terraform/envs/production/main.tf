# War — production environment
# Same composition as staging, with larger
# sizing and a standby database node.

terraform {
  required_version = "~> 1.9"

  required_providers {
    digitalocean = { source = "digitalocean/digitalocean", version = "~> 2.43" }
    cloudflare   = { source = "cloudflare/cloudflare", version = "~> 5.28" }
    time         = { source = "hashicorp/time", version = "~> 0.12" }
  }

  backend "s3" {
    endpoints                   = { s3 = "https://nyc3.digitaloceanspaces.com" }
    bucket                      = "war-tfstate"
    key                         = "envs/production/terraform.tfstate"
    region                      = "us-east-1" # ignored by Spaces; required by the backend
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = false
  }
}

locals {
  shared_pool_size = 10
  env              = "production"
  domain           = "war.tmad.dev"
}

# ── Credentials ───────────────────────────────────────────────────────────────
# Supplied by the pipeline as TF_VAR_* from GitHub Actions secrets.

variable "do_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_zone_id" {
  type      = string
  sensitive = true
}

variable "cloudflare_account_id" {
  type      = string
  sensitive = true
}

variable "internal_task_token" {
  type      = string
  sensitive = true
}

provider "digitalocean" {
  token = var.do_token
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ── Data ──────────────────────────────────────────────────────────────────────

# Production's own database, user and pool on the shared cluster, which
# shared/ owns along with its firewall.
data "digitalocean_database_cluster" "shared" {
  name = "war-staging-pg"
}

module "data" {
  source = "../../modules/data"

  cluster_id    = data.digitalocean_database_cluster.shared.id
  database_name = "war_production"
  user_name     = "war_production_api"
  pool_name     = "war-production-pool"
  pool_size     = local.shared_pool_size
}

moved {
  from = module.shared_data
  to   = module.data
}

# ── Storage ───────────────────────────────────────────────────────────────────

module "storage" {
  source     = "../../modules/storage"
  env        = local.env
  account_id = var.cloudflare_account_id
}

# ── Compute ───────────────────────────────────────────────────────────────────
# Creates the app; platform/production.yaml owns its spec thereafter.

module "compute" {
  source = "../../modules/compute"

  env                   = local.env
  domain                = local.domain
  database_cluster_name = data.digitalocean_database_cluster.shared.name
}

# DO's API can report a just-created app as having no active deployment yet
# ("Warning: No active deployment found for app") right when
# digitalocean_app.war's create call returns; module.compute.app_default_host
# is that same first read and cannot recover from a stale value by itself.
# time_sleep + a fresh data source read guards against that. Separately —
# and this is what actually broke the DNS record even once the read was
# fresh — default_ingress is a full URL ("https://<app>.ondigitalocean.app"),
# not a bare hostname, despite the compute module's own doc comment; a
# cloudflare_record CNAME's content must be a bare hostname, and prepending
# "https://" again for scheduler's api_origin would have double-scheme'd it.
# trimprefix below and the plain read here are both fixes for that, not the
# sleep/re-read.
resource "time_sleep" "app_ingress" {
  depends_on      = [module.compute]
  create_duration = "30s"
}

data "digitalocean_app" "war" {
  app_id     = module.compute.app_id
  depends_on = [time_sleep.app_ingress]
}

# ── Edge ──────────────────────────────────────────────────────────────────────

module "edge" {
  source = "../../modules/edge"

  env              = local.env
  zone_id          = var.cloudflare_zone_id
  account_id       = var.cloudflare_account_id
  domain           = local.domain
  app_default_host = trimprefix(data.digitalocean_app.war.default_ingress, "https://")
  media_bucket     = module.storage.media_bucket
}

# ── Scheduler ─────────────────────────────────────────────────────────────────

module "scheduler" {
  source = "../../modules/scheduler"

  env                 = local.env
  account_id          = var.cloudflare_account_id
  api_origin          = data.digitalocean_app.war.default_ingress
  internal_task_token = var.internal_task_token
}

# Adopts the existing cron schedule under the cron trigger's new address in
# modules/scheduler (provider v5 cannot upgrade the v4 state in place).
import {
  to = module.scheduler.cloudflare_workers_cron_trigger.cron
  id = "${nonsensitive(var.cloudflare_account_id)}/war-scheduled-tasks-${local.env}"
}

# ── Outputs ───────────────────────────────────────────────────────────────────
# app_id is consumed by the deploy pipelines as the DO_APP_ID environment
# variable.

output "app_id" {
  value = module.compute.app_id
}

output "public_base_url" {
  value = "https://${local.domain}"
}

output "media_bucket" {
  value = module.storage.media_bucket
}


output "database_cluster_name" {
  value = data.digitalocean_database_cluster.shared.name
}

variable "alert_email" {
  description = "DigitalOcean team email address for monitoring alerts."
  type        = string
  sensitive   = true
}

module "monitoring" {
  source      = "../../modules/monitoring"
  domain      = local.domain
  alert_email = var.alert_email
}

removed {
  from = module.storage.digitalocean_spaces_bucket.media
  lifecycle {
    destroy = false
  }
}

removed {
  from = module.storage.digitalocean_spaces_bucket_policy.media
  lifecycle {
    destroy = false
  }
}

removed {
  from = module.storage.digitalocean_cdn.media
  lifecycle {
    destroy = false
  }
}

removed {
  from = module.storage.digitalocean_spaces_bucket.ui_custom
  lifecycle {
    destroy = false
  }
}

removed {
  from = module.storage.digitalocean_spaces_bucket_policy.ui_custom
  lifecycle {
    destroy = false
  }
}

removed {
  from = module.storage.digitalocean_cdn.ui_custom
  lifecycle {
    destroy = false
  }
}
