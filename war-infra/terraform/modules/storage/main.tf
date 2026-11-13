terraform {
  required_version = "~> 1.9"

  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.28" }
  }
}

variable "env" {
  type = string
}

variable "account_id" {
  type      = string
  sensitive = true
}

resource "cloudflare_r2_bucket" "media" {
  account_id = var.account_id
  name       = "war-media-${var.env}"
}

output "media_bucket" {
  value = cloudflare_r2_bucket.media.name
}
