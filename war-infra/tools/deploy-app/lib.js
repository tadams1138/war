// Pure deploy-and-wait logic; every side effect is injected so the tests
// drive it with fakes. See deploy.js for the real wiring.
//
// Why this exists: the API and UI pipelines deploy to the same App Platform
// app, which runs one deployment at a time. `doctl ... --wait` waits for the
// specific deployment it created, so when the sibling pipeline's deployment
// overtook it, it sat in PENDING_BUILD until the 30 minute timeout and failed
// a job whose changes were live. The newest deployment is built from the
// current spec and source, so it includes everything an older one would have:
// waiting on the newest deployment created after our start is what matters.

const SUCCESS = 'ACTIVE';
const FAILURE = new Set(['ERROR', 'CANCELED']);

const validDeployments = (list) =>
  Array.isArray(list) ? list.filter((d) => d && typeof d.id === 'string') : [];

const time = (d) => Date.parse(d.created_at) || 0;

const sortOldestFirst = (list) => [...list].sort((a, b) => time(a) - time(b));

const newestOf = (list) => sortOldestFirst(list).at(-1);

const fail = (message) => ({ ok: false, message });

function settle(newest, firstId) {
  if (!newest) return undefined;
  if (newest.phase === SUCCESS) {
    const overtaken = newest.id !== firstId;
    const note = overtaken
      ? `deployment ${newest.id} is ACTIVE (this run's deployment ${firstId} was overtaken by a newer one, which includes this run's changes)`
      : `deployment ${newest.id} is ACTIVE`;
    return { ok: true, deploymentId: newest.id, overtaken, message: note };
  }
  if (FAILURE.has(newest.phase)) {
    return fail(`deployment ${newest.id} ended ${newest.phase}`);
  }
  return undefined;
}

// One poll: the deployments created since the start, oldest and newest.
// `track.firstId` remembers the oldest new deployment first seen: the one this
// run started, so a later ACTIVE one can be reported as an overtake.
async function observe(list, appId, known, track) {
  const fresh = sortOldestFirst(validDeployments(await list(appId)).filter((d) => !known.has(d.id)));
  track.firstId ??= fresh[0]?.id;
  return fresh.at(-1);
}

const describe = (newest) => (newest ? `deployment ${newest.id}: ${newest.phase}` : 'no new deployment yet');

export async function deployApp({ appId, startArgs, list, run, sleep, now, log, pollMs, timeoutMs }) {
  const known = new Set(validDeployments(await list(appId)).map((d) => d.id));

  const exitCode = await run(startArgs);
  if (exitCode !== 0) {
    return fail(`start command failed with exit code ${exitCode}`);
  }

  const started = now();
  const track = {};
  let newest;
  while (now() - started < timeoutMs) {
    await sleep(pollMs);
    newest = await observe(list, appId, known, track);
    log(`[${Math.round((now() - started) / 1000)}s] ${describe(newest)}`);
    const outcome = settle(newest, track.firstId);
    if (outcome) return outcome;
  }
  return fail(`timed out after ${Math.round(timeoutMs / 60_000)} minutes; ${describe(newest)}`);
}
