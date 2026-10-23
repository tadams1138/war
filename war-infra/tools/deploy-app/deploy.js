#!/usr/bin/env node
// Usage: node deploy.js <app-id> <doctl args that start a deployment...>
//   node deploy.js "$APP_ID" apps create-deployment "$APP_ID"
//   node deploy.js "$APP_ID" apps update "$APP_ID" --spec app-spec.yaml
// Do not pass --wait: this tool does the waiting. Requires Node 18+ (the
// runner image's Node is used; no install step, no dependencies).
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { deployApp } from './lib.js';

const execFileAsync = promisify(execFile);
const POLL_MS = 15_000;
const TIMEOUT_MS = 30 * 60_000;

const [appId, ...startArgs] = process.argv.slice(2);
if (!appId || startArgs.length === 0) {
  console.error('usage: deploy.js <app-id> <doctl args...>');
  process.exit(2);
}

const list = async (id) => {
  const { stdout } = await execFileAsync('doctl', ['apps', 'list-deployments', id, '-o', 'json'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout);
};

const run = (args) =>
  new Promise((resolve) => {
    const child = spawn('doctl', args, { stdio: 'inherit' });
    child.on('error', () => resolve(127));
    child.on('close', (code) => resolve(code ?? 1));
  });

const result = await deployApp({
  appId,
  startArgs,
  list,
  run,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
  log: (line) => console.log(line),
  pollMs: POLL_MS,
  timeoutMs: TIMEOUT_MS,
});

console.log(result.ok ? `OK: ${result.message}` : `FAILED: ${result.message}`);
process.exit(result.ok ? 0 : 1);
