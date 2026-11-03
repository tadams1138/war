# Managed PostgreSQL — see war-spec.md
#
# One environment's logical database, user and connection pool on the shared
# cluster. The platform YAMLs bind the API service to this pool and the
# migration job to the direct URL, both as this user.

# Required in every module that uses it, not just the root — Terraform does
# not infer a non-default-namespace provider's source for a child module from
# the root's required_providers alone.
terraform {
  required_version = "~> 1.9"

  required_providers {
    digitalocean = { source = "digitalocean/digitalocean", version = "~> 2.43" }
  }
}

# Cluster lifecycle and its complete firewall rule set belong to shared/.
# The DO provider cannot manage PostgreSQL database grants. Manual SQL and
# negative credential tests in README are required before either app uses this.
variable "cluster_id" {
  type = string
}
variable "database_name" {
  type = string
}
variable "user_name" {
  type = string
}
variable "pool_name" {
  type = string
}
variable "pool_size" {
  type = number
}

resource "digitalocean_database_db" "war" {
  cluster_id = var.cluster_id
  name       = var.database_name
}

resource "digitalocean_database_user" "api" {
  cluster_id = var.cluster_id
  name       = var.user_name

  # Terraform planned an in-place update to this resource on the second real
  # apply despite neither argument above ever changing - the only other
  # top-level attributes the provider's schema documents, mysql_auth_plugin
  # and settings, are MySQL- and Kafka-specific respectively and shouldn't
  # apply to a "pg" cluster, but the provider records an empty settings {}
  # block in state regardless and later plans to remove it. Either attempted
  # update fails outright: "PUT .../users/war_api: 400 ... missing the
  # following required fields: user_settings" - a provider-side request-
  # construction bug for this engine, not something fixable from here.
  # Ignoring both stops Terraform from ever taking that path for attributes
  # that have no meaning for this cluster anyway. mysql_auth_plugin drifted
  # first (staging); settings surfaced only later, on production's first
  # apply - add the next one here too if the provider finds a third.
  lifecycle {
    ignore_changes = [mysql_auth_plugin, settings]
  }
}

# Transaction-mode pooling. Session-mode would hold a backend connection for the
# whole client session and defeat the purpose; the API uses no session state
# (no advisory locks, no prepared-statement reuse across requests) so
# transaction mode is safe.
resource "digitalocean_database_connection_pool" "api" {
  cluster_id = var.cluster_id
  name       = var.pool_name
  mode       = "transaction"
  size       = var.pool_size
  db_name    = digitalocean_database_db.war.name
  user       = digitalocean_database_user.api.name
}

output "database_name" {
  value = digitalocean_database_db.war.name
}

# The pooled URI, which the API service binds as ${db.<pool-name>.DATABASE_URL}.
# See the README cutover runbook before changing runtime bindings.
output "pooled_uri" {
  value     = digitalocean_database_connection_pool.api.private_uri
  sensitive = true
}
