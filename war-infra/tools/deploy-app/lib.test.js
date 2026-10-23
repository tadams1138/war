import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployApp } from './lib.js';

const dep = (id, phase, createdAt) => ({ id, phase, created_at: createdAt });
const OLD = dep('old', 'ACTIVE', '2026-01-01T00:00:00Z');

// Fakes: `polls` is a list of deployment lists, one per list() call; the
// first call is the pre-start snapshot, the last is repeated forever.
function harness({ polls, startExit = 0, timeoutMs = 10 * 60_000 }) {
  const state = { listCalls: 0, runs: [], logs: [], clock: 0 };
  const deps = {
    appId: 'app-1',
    startArgs: ['apps', 'create-deployment', 'app-1'],
    pollMs: 15_000,
    timeoutMs,
    list: async () => polls[Math.min(state.listCalls++, polls.length - 1)],
    run: async (args) => {
      state.runs.push(args);
      return startExit;
    },
    sleep: async (ms) => {
      state.clock += ms;
    },
    now: () => state.clock,
    log: (line) => state.logs.push(line),
  };
  return { state, deps };
}

test('succeeds when the deployment this run started goes PENDING_BUILD, BUILDING, ACTIVE', async () => {
  // Arrange
  const mine = (phase) => dep('mine', phase, '2026-02-01T00:00:00Z');
  const { deps, state } = harness({
    polls: [[OLD], [OLD], [OLD, mine('PENDING_BUILD')], [OLD, mine('BUILDING')], [OLD, mine('ACTIVE')]],
  });

  // Act
  const result = await deployApp(deps);

  // Assert
  assert.equal(result.ok, true);
  assert.equal(result.deploymentId, 'mine');
  assert.equal(result.overtaken, false);
  assert.deepEqual(state.runs, [['apps', 'create-deployment', 'app-1']]);
  assert.ok(state.logs.some((l) => l.includes('mine') && l.includes('BUILDING')));
});

test('fails naming the deployment this run started when it ends ERROR', async () => {
  // Arrange
  const mine = (phase) => dep('mine', phase, '2026-02-01T00:00:00Z');
  const { deps } = harness({ polls: [[OLD], [OLD, mine('BUILDING')], [OLD, mine('ERROR')]] });

  // Act
  const result = await deployApp(deps);

  // Assert
  assert.equal(result.ok, false);
  assert.match(result.message, /mine/);
  assert.match(result.message, /ERROR/);
});

test('fails when the deployment ends CANCELED', async () => {
  // Arrange
  const { deps } = harness({ polls: [[OLD], [OLD, dep('mine', 'CANCELED', '2026-02-01T00:00:00Z')]] });

  // Act
  const result = await deployApp(deps);

  // Assert
  assert.equal(result.ok, false);
  assert.match(result.message, /CANCELED/);
});

test('succeeds and reports being overtaken when a newer deployment from the other pipeline goes ACTIVE (the incident)', async () => {
  // Arrange
  const mine = (phase) => dep('mine', phase, '2026-02-01T00:00:00Z');
  const theirs = (phase) => dep('theirs', phase, '2026-02-01T00:00:24Z');
  const { deps } = harness({
    polls: [
      [OLD],
      [OLD, mine('PENDING_BUILD')],
      [OLD, mine('PENDING_BUILD'), theirs('BUILDING')],
      [OLD, mine('PENDING_BUILD'), theirs('ACTIVE')],
    ],
  });

  // Act
  const result = await deployApp(deps);

  // Assert
  assert.equal(result.ok, true);
  assert.equal(result.deploymentId, 'theirs');
  assert.equal(result.overtaken, true);
  assert.match(result.message, /overtaken/i);
});

test('fails when this run is SUPERSEDED by a newer deployment that ends ERROR', async () => {
  // Arrange
  const mine = (phase) => dep('mine', phase, '2026-02-01T00:00:00Z');
  const theirs = (phase) => dep('theirs', phase, '2026-02-01T00:00:24Z');
  const { deps } = harness({
    polls: [
      [OLD],
      [OLD, mine('SUPERSEDED')],
      [OLD, mine('SUPERSEDED'), theirs('BUILDING')],
      [OLD, mine('SUPERSEDED'), theirs('ERROR')],
    ],
  });

  // Act
  const result = await deployApp(deps);

  // Assert
  assert.equal(result.ok, false);
  assert.match(result.message, /theirs/);
  assert.match(result.message, /ERROR/);
});

test('ignores deployments that existed before the start, even newer-looking or ACTIVE ones', async () => {
  // Arrange
  const before = dep('before', 'ACTIVE', '2030-01-01T00:00:00Z');
  const mine = (phase) => dep('mine', phase, '2026-02-01T00:00:00Z');
  const { deps } = harness({
    polls: [[OLD, before], [OLD, before], [OLD, before, mine('BUILDING')], [OLD, before, mine('ERROR')]],
  });

  // Act
  const result = await deployApp(deps);

  // Assert
  assert.equal(result.ok, false);
  assert.match(result.message, /mine/);
});

test('fails with the newest deployment and its phase when nothing settles before the timeout', async () => {
  // Arrange
  const stuck = dep('stuck', 'PENDING_BUILD', '2026-02-01T00:00:00Z');
  const { deps, state } = harness({ polls: [[OLD], [OLD, stuck]], timeoutMs: 60_000 });

  // Act
  const result = await deployApp(deps);

  // Assert
  assert.equal(result.ok, false);
  assert.match(result.message, /timed out/i);
  assert.match(result.message, /stuck/);
  assert.match(result.message, /PENDING_BUILD/);
  assert.ok(state.clock >= 60_000);
});

test('times out cleanly when no new deployment ever appears', async () => {
  // Arrange
  const { deps } = harness({ polls: [[OLD]], timeoutMs: 30_000 });

  // Act
  const result = await deployApp(deps);

  // Assert
  assert.equal(result.ok, false);
  assert.match(result.message, /timed out/i);
});

test('fails without polling when the start command fails', async () => {
  // Arrange
  const { deps, state } = harness({ polls: [[OLD]], startExit: 1 });

  // Act
  const result = await deployApp(deps);

  // Assert
  assert.equal(result.ok, false);
  assert.match(result.message, /start command/i);
  assert.equal(state.listCalls, 1);
  assert.equal(state.clock, 0);
});

test('tolerates a non-array or malformed list result by treating it as empty', async () => {
  // Arrange
  const { deps } = harness({ polls: [[OLD], null, [OLD, null, {}], [dep('mine', 'ACTIVE', '2026-02-01T00:00:00Z')]] });

  // Act
  const result = await deployApp(deps);

  // Assert
  assert.equal(result.ok, true);
  assert.equal(result.deploymentId, 'mine');
});
