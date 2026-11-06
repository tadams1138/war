import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared cluster adoption cannot destroy the staging cluster or its firewall', () => {
  // Arrange
  const staging = read('terraform/envs/staging/main.tf');
  const shared = read('terraform/shared/main.tf');
  // Act
  const released = [...staging.matchAll(/removed\s*\{\s*from\s*=\s*module\.data\.digitalocean_database_(cluster|firewall)\.pg\s*lifecycle\s*\{\s*destroy\s*=\s*false/g)];
  // Assert
  assert.equal(released.length, 2);
  assert.match(shared, /resource "digitalocean_database_cluster" "pg"/);
  assert.match(shared, /prevent_destroy\s*=\s*true/);
  assert.match(shared, /to\s*=\s*digitalocean_database_cluster\.pg/);
  assert.match(shared, /to\s*=\s*digitalocean_database_firewall\.pg/);
  assert.match(shared, /value\s*=\s*var\.staging_app_id/);
  assert.match(shared, /value\s*=\s*var\.production_app_id/);
});

test('environment databases use distinct identities and bounded pools on the shared cluster only', () => {
  // Arrange
  const staging = read('terraform/envs/staging/main.tf');
  const production = read('terraform/envs/production/main.tf');
  const data = read('terraform/modules/data/main.tf');
  // Act
  const poolSizes = [staging, production].map((config) => Number(config.match(/shared_pool_size\s*=\s*(\d+)/)?.[1]));
  // Assert
  assert.deepEqual(poolSizes, [5, 10]);
  assert.ok(poolSizes.reduce((total, size) => total + size, 0) <= 16);
  assert.match(staging, /database_name\s*=\s*"war"/);
  assert.match(staging, /user_name\s*=\s*"war_api"/);
  assert.match(production, /database_name\s*=\s*"war_production"/);
  assert.match(production, /user_name\s*=\s*"war_production_api"/);
  assert.doesNotMatch(production, /legacy-data/);
  assert.doesNotMatch(data, /resource "digitalocean_database_(cluster|firewall)"/);
  assert.match(data, /name\s*=\s*var.database_name/);
  assert.match(data, /name\s*=\s*var.user_name/);
  assert.match(data, /name\s*=\s*var.pool_name/);
});

test('each app binds its own database and user, the service through its pool and migrations directly', () => {
  // Arrange
  // Production's component is not named `db`: App Platform keeps an existing
  // component attached to its original cluster even after cluster_name changes,
  // so moving production off war-production-pg needed a new component.
  const specs = {
    staging: { yaml: read('platform/staging.yaml'), component: 'db', db: 'war', user: 'war_api', pool: 'war-staging-pool' },
    production: { yaml: read('platform/production.yaml'), component: 'shared', db: 'war_production', user: 'war_production_api', pool: 'war-production-pool' },
  };
  for (const { yaml, component, db, user, pool } of Object.values(specs)) {
    // Act
    const [service, job] = yaml.split(/^jobs:/m);
    const bindings = [...yaml.matchAll(/\$\{([a-z0-9-]+)\.[A-Za-z0-9_.-]+\}/g)].map((m) => m[1]);
    // Assert
    assert.match(yaml, new RegExp(`- name: ${component}\\n\\s+engine: PG\\n\\s+cluster_name: war-staging-pg\\n`));
    assert.match(yaml, new RegExp(`db_name: ${db}\\n`));
    assert.match(yaml, new RegExp(`db_user: ${user}\\n`));
    assert.deepEqual([...new Set(bindings)], [component]);
    assert.match(service, new RegExp(`value: \\$\\{${component}\\.${pool}\\.DATABASE_URL\\}`));
    assert.doesNotMatch(service, new RegExp(`value: \\$\\{${component}\\.DATABASE_URL\\}`));
    assert.match(job, new RegExp(`value: \\$\\{${component}\\.DATABASE_URL\\}`));
  }
});

test('nothing refers to the retired production cluster', () => {
  // Arrange
  const yaml = read('platform/production.yaml');
  const production = read('terraform/envs/production/main.tf');
  // Act
  const components = [...yaml.matchAll(/^  - name: ([a-z0-9-]+)\n\s+engine: PG/gm)].map((m) => m[1]);
  // Assert
  assert.deepEqual(components, ['shared']);
  assert.doesNotMatch(yaml, /war-production-pg/);
  assert.doesNotMatch(production, /war-production-pg/);
});

test('names describe the shared cluster role, not the environment it was created for', () => {
  // Arrange
  const shared = read('terraform/shared/main.tf');
  const production = read('terraform/envs/production/main.tf');
  // Act
  const tags = shared.match(/resource "digitalocean_database_cluster" "pg" \{[\s\S]*?tags\s*=\s*(\[[^\]]*\])/)?.[1];
  // Assert
  assert.equal(tags, '["war", "shared"]');
  assert.doesNotMatch(shared, /data "digitalocean_database_cluster" "existing"/);
  assert.match(production, /module "data" \{/);
  assert.doesNotMatch(production, /module "shared_data"/);
  assert.match(production, /moved\s*\{\s*from\s*=\s*module\.shared_data\s*to\s*=\s*module\.data\s*\}/);
});
