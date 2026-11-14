import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('media storage uses private R2 while retiring Spaces without destroying data', () => {
  // Arrange
  const storage = read('terraform/modules/storage/main.tf');
  const edge = read('terraform/modules/edge/main.tf');
  const roots = ['staging', 'production'].map((env) => read(`terraform/envs/${env}/main.tf`));
  const workflow = read('../.github/workflows/infra.yml');
  const resources = ['digitalocean_spaces_bucket.media', 'digitalocean_spaces_bucket_policy.media', 'digitalocean_cdn.media', 'digitalocean_spaces_bucket.ui_custom', 'digitalocean_spaces_bucket_policy.ui_custom', 'digitalocean_cdn.ui_custom'];

  // Act
  const retired = roots.map((root) => resources.map((resource) => root.includes(`from = module.storage.${resource}`)));

  // Assert
  assert.match(storage, /resource "cloudflare_r2_bucket" "media"/);
  assert.match(storage, /name\s*= "war-media-\$\{var.env\}"/);
  assert.match(storage, /account_id\s*= var.account_id/);
  assert.doesNotMatch(storage, /resource "digitalocean_|ui_custom|policy|public/);
  assert.match(edge, /type\s*= "r2_bucket"/);
  assert.match(edge, /name\s*= "MEDIA_BUCKET"/);
  assert.match(edge, /bucket_name\s*= var.media_bucket/);
  assert.doesNotMatch(edge, /ui_router|ui_custom|CDN_ORIGIN|cdn_host/);
  assert.ok(retired.flat().every(Boolean));
  for (const root of roots) {
    for (const resource of resources) {
      const block = root.slice(root.indexOf(`from = module.storage.${resource}`));
      assert.match(block, /^[^}]*lifecycle\s*\{\s*destroy = false/);
    }
    assert.match(root, /account_id\s*= var.cloudflare_account_id/);
    assert.match(root, /media_bucket\s*= module.storage.media_bucket/);
    assert.doesNotMatch(root, /spaces_access|spaces_secret|cdn_host|ui_custom_bucket/);
  }
  assert.doesNotMatch(workflow, /TF_VAR_spaces_/);
  assert.match(workflow, /AWS_ACCESS_KEY_ID:.*TF_STATE_R2_ACCESS_KEY_ID/);
  assert.match(workflow, /AWS_SECRET_ACCESS_KEY:.*TF_STATE_R2_SECRET_ACCESS_KEY/);
});

test('Terraform state lives in R2 with lock files in every root and pipeline', () => {
  // Arrange
  const roots = ['shared', 'envs/staging', 'envs/production', 'ui'].map((dir) => read(`terraform/${dir}/main.tf`));
  const workflows = ['infra', 'app'].map((name) => read(`../.github/workflows/${name}.yml`));

  // Act
  const backends = roots.map((root) => root.slice(root.indexOf('backend "s3"')));

  // Assert
  for (const backend of backends) {
    assert.match(backend, /use_lockfile\s*= true/);
    assert.match(backend, /region\s*= "auto"/);
    assert.match(backend, /use_path_style\s*= true/);
    assert.doesNotMatch(backend, /digitaloceanspaces\.com/);
  }
  for (const workflow of workflows) {
    assert.doesNotMatch(workflow, /SPACES_ACCESS_KEY_ID/);
    assert.match(workflow, /AWS_ENDPOINT_URL_S3:/);
  }
});
