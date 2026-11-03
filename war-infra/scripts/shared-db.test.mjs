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

test('environment databases use distinct identities and bounded pools without retiring production', () => {
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
  assert.match(production, /source\s*=\s*"\.\.\/\.\.\/modules\/legacy-data"/);
  assert.doesNotMatch(data, /resource "digitalocean_database_(cluster|firewall)"/);
  assert.match(data, /name\s*=\s*var.database_name/);
  assert.match(data, /name\s*=\s*var.user_name/);
  assert.match(data, /name\s*=\s*var.pool_name/);
  assert.match(read('platform/production.yaml'), /cluster_name: war-production-pg/);
});
