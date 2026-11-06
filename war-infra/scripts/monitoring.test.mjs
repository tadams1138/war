import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared database has CPU, memory and disk alerts above 80 percent for five minutes', () => {
  // Arrange
  const shared = read('terraform/shared/main.tf');
  const types = ['cpu_alerts', 'memory_utilization_alerts', 'disk_utilization_alerts'];
  // Act
  const alerts = [...shared.matchAll(/resource "digitalocean_monitor_alert" "[^"]+" \{([\s\S]*?)^\}/gm)];
  // Assert
  assert.equal(alerts.length, 3);
  for (const type of types) {
    const alert = alerts.find(([, body]) => body.includes(`v1/dbaas/alerts/${type}`));
    assert.ok(alert, `Missing database alert: ${type}`);
    assert.match(alert[1], /entities\s*=\s*\[digitalocean_database_cluster\.pg\.id\]/);
    assert.match(alert[1], /compare\s*=\s*"GreaterThan"/);
    assert.match(alert[1], /value\s*=\s*80\b/);
    assert.match(alert[1], /window\s*=\s*"5m"/);
    assert.match(alert[1], /enabled\s*=\s*true/);
    assert.match(alert[1], /email\s*=\s*\[var\.alert_email\]/);
  }
  assert.match(shared, /variable "alert_email"/);
});

for (const [env, domain] of [['staging', 'staging.war.tmad.dev'], ['production', 'war.tmad.dev']]) {
  test(`${env} monitors its public domain using the shared monitoring module`, () => {
    // Arrange
    const config = read(`terraform/envs/${env}/main.tf`);
    // Act
    const module = config.match(/module "monitoring" \{([\s\S]*?)^\}/m);
    // Assert
    assert.ok(module, 'Missing monitoring module');
    assert.match(module[1], /source\s*=\s*"\.\.\/\.\.\/modules\/monitoring"/);
    assert.match(module[1], /domain\s*=\s*local\.domain/);
    assert.match(module[1], /alert_email\s*=\s*var\.alert_email/);
    assert.ok(config.includes(`"${domain}"`));
    assert.match(config, /variable "alert_email"/);
  });
}

test('monitoring uses one scheduled-task health check with availability, latency and certificate alerts', () => {
  // Arrange
  const config = read('terraform/modules/monitoring/main.tf');
  // Act
  const checks = [...config.matchAll(/resource "digitalocean_uptime_check" "([^"]+)" \{([\s\S]*?)^\}/gm)];
  const alerts = [...config.matchAll(/resource "digitalocean_uptime_alert" "[^"]+" \{([\s\S]*?)^\}/gm)];
  // Assert
  assert.equal(checks.length, 1);
  assert.equal(alerts.length, 3);
  for (const path of ['/api/v1/health/scheduled-tasks']) {
    const check = checks.find(([, , body]) => body.includes(`https://${'${var.domain}'}${path}"`));
    assert.ok(check, `Missing check: ${path}`);
    assert.match(check[2], /type\s*=\s*"https"/);
    assert.match(check[2], /regions\s*=\s*\["us_east",\s*"eu_west"\]/);
    assert.match(check[2], /enabled\s*=\s*true/);
    const attached = alerts.filter(([, body]) => body.includes(`digitalocean_uptime_check.${check[1]}.id`));
    const down = attached.find(([, body]) => /type\s*=\s*"down"/.test(body));
    assert.ok(down, `Missing down alert: ${path}`);
    assert.match(down[1], /period\s*=\s*"2m"/);
    assert.equal(attached.length, 3);
  }
  const latency = alerts.find(([, body]) => /type\s*=\s*"latency"/.test(body));
  assert.ok(latency);
  assert.match(latency[1], /threshold\s*=\s*2000\b/);
  assert.match(latency[1], /comparison\s*=\s*"greater_than"/);
  assert.match(latency[1], /period\s*=\s*"5m"/);
  const ssl = alerts.find(([, body]) => /type\s*=\s*"ssl_expiry"/.test(body));
  assert.ok(ssl);
  assert.match(ssl[1], /threshold\s*=\s*14\b/);
  for (const [, body] of alerts) {
    // DigitalOcean's API rejects any uptime alert without a period, even ssl_expiry.
    assert.match(body, /period\s*=\s*"(2m|3m|5m|10m|15m|30m|1h)"/);
    assert.match(body, /notifications\s*\{\s*email\s*=\s*\[var\.alert_email\]/);
  }
});

test('the down alert declares the comparison and threshold DigitalOcean stores, so plans show no drift', () => {
  // Arrange
  const config = read('terraform/modules/monitoring/main.tf');
  // Act
  const down = config.match(/resource "digitalocean_uptime_alert" "down" \{([\s\S]*?)^\}/m);
  // Assert
  assert.ok(down, 'Missing down alert');
  assert.match(down[1], /comparison\s*=\s*"less_than"/);
  assert.match(down[1], /threshold\s*=\s*1\b/);
});

test('the alert email is a sensitive secret everywhere it is passed', () => {
  // Arrange
  const workflow = read('../.github/workflows/infra.yml');
  const roots = ['terraform/shared/main.tf', 'terraform/envs/staging/main.tf', 'terraform/envs/production/main.tf', 'terraform/modules/monitoring/main.tf'];
  // Act
  const declarations = roots.map((path) => read(path).match(/variable "alert_email" \{([\s\S]*?)^\}/m)?.[1] ?? '');
  // Assert
  assert.match(workflow, /TF_VAR_alert_email:\s*\$\{\{\s*secrets\.ALERT_EMAIL\s*\}\}/);
  assert.doesNotMatch(workflow, /vars\.ALERT_EMAIL/);
  for (const declaration of declarations) {
    assert.match(declaration, /sensitive\s*=\s*true/);
  }
});
