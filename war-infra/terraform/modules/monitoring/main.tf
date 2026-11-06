terraform {
  required_version = "~> 1.9"

  required_providers {
    digitalocean = { source = "digitalocean/digitalocean", version = "~> 2.43" }
  }
}

variable "domain" {
  type = string
}

variable "alert_email" {
  description = "DigitalOcean team email address for monitoring alerts."
  type        = string
  sensitive   = true
}

# This single endpoint covers API/database availability and nightly task freshness.
# Its handler is delivered separately: 200 when fresh, 503 otherwise.
resource "digitalocean_uptime_check" "scheduled_tasks" {
  name    = "${var.domain} scheduled tasks health"
  type    = "https"
  target  = "https://${var.domain}/api/v1/health/scheduled-tasks"
  regions = ["us_east", "eu_west"]
  enabled = true
}

resource "digitalocean_uptime_alert" "down" {
  name     = "${var.domain} down"
  check_id = digitalocean_uptime_check.scheduled_tasks.id
  type     = "down"
  # DigitalOcean stores this value for down alerts; declaring it stops a perpetual plan diff.
  comparison = "less_than"
  period     = "2m"

  notifications {
    email = [var.alert_email]
  }
}

resource "digitalocean_uptime_alert" "latency" {
  name       = "${var.domain} latency"
  check_id   = digitalocean_uptime_check.scheduled_tasks.id
  type       = "latency"
  comparison = "greater_than"
  threshold  = 2000
  period     = "5m"

  notifications {
    email = [var.alert_email]
  }
}

resource "digitalocean_uptime_alert" "ssl_expiry" {
  name       = "${var.domain} ssl_expiry"
  check_id   = digitalocean_uptime_check.scheduled_tasks.id
  type       = "ssl_expiry"
  comparison = "less_than"
  threshold  = 14
  # Required by DigitalOcean's API for every uptime alert type.
  period = "5m"

  notifications {
    email = [var.alert_email]
  }
}
