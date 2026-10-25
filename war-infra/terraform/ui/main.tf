# Default UI — the Cloudflare Worker that serves the built SPA from static assets.
#
# This root is separate from envs/* on purpose: the infra pipeline must never need
# the UI build. Applying it needs war-ui-default/dist/ on disk (assets_dir), and
# only the app.yml pipeline, which builds the UI first, applies it.
#
# The more specific /media/* and /ui/* routes in modules/edge win over the /* route
# below, so those paths never reach this Worker.

terraform {
  required_version = "~> 1.9"

  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.28" }
  }

  # No key: the pipeline passes -backend-config=key=ui/<env>/terraform.tfstate.
  backend "s3" {
    endpoints                   = { s3 = "https://nyc3.digitaloceanspaces.com" }
    bucket                      = "war-tfstate"
    region                      = "us-east-1" # ignored by Spaces; required by the backend
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = false
  }
}

variable "env" {
  type = string
}

variable "domain" {
  type = string
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

variable "assets_dir" {
  type        = string
  description = "Path to the built UI (war-ui-default/dist)"
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

resource "cloudflare_workers_script" "ui_default" {
  account_id         = var.cloudflare_account_id
  script_name        = "war-ui-default-${var.env}"
  main_module        = "ui-default.js"
  content            = file("${path.module}/../../edge/ui-default.js")
  compatibility_date = "2025-04-02"

  bindings = [{
    type = "assets"
    name = "ASSETS"
  }]

  assets = {
    directory = var.assets_dir
    config = {
      not_found_handling = "single-page-application"
      run_worker_first   = ["/wars/*"]
      # _headers rules, kept out of the build so they are never served as a file.
      headers = file("${path.module}/asset-headers")
    }
  }
}

resource "cloudflare_workers_route" "ui_default" {
  zone_id = var.cloudflare_zone_id
  pattern = "${var.domain}/*"
  script  = cloudflare_workers_script.ui_default.script_name
}

# No script: keeps /api/v1/* out of the /* route and sends it to App Platform.
resource "cloudflare_workers_route" "api_passthrough" {
  zone_id = var.cloudflare_zone_id
  pattern = "${var.domain}/api/v1/*"
}
