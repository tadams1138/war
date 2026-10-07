/**
 * Seeds a realistic data volume into a throwaway Testcontainers Postgres and runs
 * `EXPLAIN (ANALYZE, BUFFERS)` over every Staff read query (admin Wars, admin Voters,
 * a Voter's votes, the moderation log).
 *
 * The SQL is captured from the real repository functions through Kysely's `log` hook, so it is
 * exactly what the API runs; nothing is re-typed here.
 *
 *   npm --prefix war-api run explain-admin
 *   VOTERS=5000 WARS=20000 VOTES=200000 npm --prefix war-api run explain-admin
 *   npm --prefix war-api run explain-admin -- --before-migration 20260117000000_admin_query_indexes
 *     (migrates up to just before that migration and explains, then applies it and explains again)
 *   ... -- --plans   also prints every full plan
 *
 * Needs Docker. Not part of the test suite and not a deployed artifact.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { Database } from '../src/db/types.js';
import { findAdminVoter, listAdminVoters } from '../src/admin/adminVotersRepository.js';
import { listAdminWars } from '../src/admin/adminWarsRepository.js';
import { listAdminVotes } from '../src/admin/adminVotesRepository.js';
import { listModerationLog } from '../src/moderation/moderationLogRepository.js';

const VOTERS = Number(process.env.VOTERS ?? 20_000);
const WARS = Number(process.env.WARS ?? 50_000);
const VOTES = Number(process.env.VOTES ?? 500_000);
const REPORTS = Math.floor(WARS / 2);
const LOG_ROWS = Math.floor(VOTES / 5);
const PAGE = 50;

const migrationsDir = path.resolve(process.cwd(), 'db/migrations');

interface Captured {
  sql: string;
  parameters: readonly unknown[];
}

interface Case {
  name: string;
  run: (db: Kysely<Database>) => Promise<unknown>;
}

async function migrate(url: string, count?: number): Promise<void> {
  await runner({ databaseUrl: url, dir: migrationsDir, direction: 'up', migrationsTable: 'pgmigrations', log: () => {}, count });
}

async function seed(pool: pg.Pool): Promise<void> {
  const exec = (text: string) => pool.query(text);
  await exec(`
    INSERT INTO voters (id, provider, provider_user_id, display_name, is_moderator, is_admin, suspended_at, banned_at, created_at)
    SELECT gen_random_uuid(), 'google', 'u' || g,
           (array['Alex','Sam','Jordan','Taylor','Riley','Casey','Morgan','Quinn'])[1 + g % 8] || ' ' ||
           (array['Smith','Jones','Brown','Lee','Garcia','Khan','Novak','Ito'])[1 + g % 7] || ' ' || g,
           g % 500 = 0, g % 2000 = 1,
           CASE WHEN g % 97 = 0 THEN now() END, CASE WHEN g % 101 = 0 THEN now() END,
           now() - random() * interval '730 days'
    FROM generate_series(1, ${VOTERS}) g`);
  await exec(`CREATE TEMP TABLE vn AS SELECT row_number() OVER (ORDER BY id) AS n, id FROM voters`);
  await exec(`
    INSERT INTO wars (id, creator_id, title, status, visibility, removed_at, created_at)
    SELECT gen_random_uuid(), v.id,
           (array['Best','Worst','Ultimate','Greatest','Final','Epic'])[1 + g % 6] || ' ' ||
           (array['Pizza','Movie','Album','Cartoon','Sneaker','Game','Snack'])[1 + g % 7] || ' war ' || g,
           (array['draft','published','published','published','closed'])[1 + g % 5],
           CASE WHEN g % 9 = 0 THEN 'invite_only' ELSE 'public' END,
           CASE WHEN g % 50 = 0 THEN now() END,
           now() - random() * interval '730 days'
    FROM generate_series(1, ${WARS}) g JOIN vn v ON v.n = 1 + (g * 7919) % ${VOTERS}`);
  await exec(`CREATE TEMP TABLE wn AS SELECT row_number() OVER (ORDER BY id) AS n, id FROM wars`);
  await exec(`CREATE TEMP TABLE pairs AS
    SELECT n, id AS war_id, gen_random_uuid() AS a, gen_random_uuid() AS b, gen_random_uuid() AS m FROM wn`);
  await exec(`INSERT INTO contestants (id, war_id, name)
    SELECT a, war_id, 'A' || n FROM pairs UNION ALL SELECT b, war_id, 'B' || n FROM pairs`);
  await exec(`INSERT INTO matchups (id, war_id, contestant_a_id, contestant_b_id)
    SELECT m, war_id, least(a, b), greatest(a, b) FROM pairs`);
  // Matchup (i mod WARS) gets voter (m*13 + k*491) mod VOTERS for k = i div WARS: distinct per matchup.
  await exec(`INSERT INTO votes (id, matchup_id, voter_id, winner_id, presented_left_id, created_at)
    SELECT gen_random_uuid(), p.m, v.id, CASE WHEN i % 2 = 0 THEN p.a ELSE p.b END, p.a, now() - random() * interval '700 days'
    FROM generate_series(0, ${VOTES - 1}) i
    JOIN pairs p ON p.n = (i % ${WARS}) + 1
    JOIN vn v ON v.n = (((i % ${WARS}) * 13 + (i / ${WARS}) * 491) % ${VOTERS}) + 1`);
  await exec(`INSERT INTO reports (id, war_id, reporter_id, explanation, addressed, created_at)
    SELECT gen_random_uuid(), w.id, v.id, 'spam', g % 3 <> 0, now() - random() * interval '365 days'
    FROM generate_series(1, ${REPORTS}) g JOIN wn w ON w.n = 1 + (g * 31) % ${WARS} JOIN vn v ON v.n = 1 + (g * 17) % ${VOTERS}`);
  await exec(`INSERT INTO moderation_log (id, action, staff_voter_id, target_war_id, target_voter_id, created_at)
    SELECT gen_random_uuid(), (array['remove_war','suspend_voter','ban_voter','grant_role_moderator'])[1 + g % 4],
           s.id, CASE WHEN g % 4 = 0 THEN w.id END, CASE WHEN g % 4 <> 0 THEN v.id END, now() - random() * interval '365 days'
    FROM generate_series(1, ${LOG_ROWS}) g
    JOIN (SELECT id, row_number() OVER () AS n FROM voters WHERE is_moderator OR is_admin) s ON s.n = 1 + g % 40
    JOIN wn w ON w.n = 1 + (g * 13) % ${WARS} JOIN vn v ON v.n = 1 + (g * 29) % ${VOTERS}`);
  await exec('ANALYZE');
}

/** Runs `run` against a Kysely that records every statement it sends, and returns them. */
async function captureSql(pool: pg.Pool, run: (db: Kysely<Database>) => Promise<unknown>): Promise<Captured[]> {
  const seen: Captured[] = [];
  const logged = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    log: (event) => {
      if (event.level === 'query') seen.push({ sql: event.query.sql, parameters: event.query.parameters });
    },
  });
  await run(logged);
  return seen;
}

function bufferSummary(plan: string): string {
  const hit = /Buffers: shared hit=(\d+)(?: read=(\d+))?/.exec(plan);
  if (!hit) return '?';
  return hit[2] ? `hit=${hit[1]} read=${hit[2]}` : `hit=${hit[1]}`;
}

function summarize(plan: string): { ms: string; node: string; buffers: string; seqScans: string[]; sorts: number } {
  const ms = /Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? '?';
  const node = (plan.split('\n')[0] ?? '').replace(/\s*\(cost.*$/, '').trim();
  const seqScans = [...plan.matchAll(/Seq Scan on (\w+)/g)].map((m) => m[1] as string);
  const sorts = (plan.match(/^\s*(?:->\s+)?(?:Incremental )?Sort\s+\(/gm) ?? []).length;
  return { ms, node, buffers: bufferSummary(plan), seqScans, sorts };
}

async function explainStatement(pool: pg.Pool, q: Captured): Promise<string> {
  const result = await pool.query(`EXPLAIN (ANALYZE, BUFFERS) ${q.sql}`, [...q.parameters]);
  return result.rows.map((r: Record<string, string>) => r['QUERY PLAN']).join('\n');
}

function summaryLine(name: string, plan: string): string {
  const s = summarize(plan);
  return `${name} | ${s.ms} | ${s.buffers} | ${s.seqScans.join(',') || '-'} | ${s.sorts} | ${s.node}`;
}

async function explainAll(label: string, pool: pg.Pool, cases: Case[], showPlans: boolean): Promise<void> {
  console.log(`\n=== ${label} ===`);
  console.log('query | ms | buffers | seq scans | sorts | top node');
  for (const c of cases) {
    const captured = await captureSql(pool, c.run);
    for (const [i, q] of captured.entries()) {
      const plan = await explainStatement(pool, q);
      console.log(summaryLine(captured.length > 1 ? `${c.name} [stmt ${i + 1}]` : c.name, plan));
      if (showPlans) console.log(`${q.sql}\n${plan}\n`);
    }
  }
}

type Paged = { kind: string; nextCursor?: string | null };
const cursorOf = (outcome: Paged): string | undefined => (outcome.kind === 'ok' ? (outcome.nextCursor ?? undefined) : undefined);

async function buildCases(db: Kysely<Database>): Promise<Case[]> {
  const heavy = await sql<{ id: string }>`select voter_id as id from votes group by voter_id order by count(*) desc limit 1`.execute(db);
  const voterId = heavy.rows[0]!.id;
  const wc = cursorOf(await listAdminWars(db, { now: new Date(), limit: 10_000 }));
  const vc = cursorOf(await listAdminVoters(db, { limit: 10_000 }));
  const lc = cursorOf(await listModerationLog(db, { limit: 10_000 }));
  const vvc = cursorOf(await listAdminVotes(db, voterId, { limit: 5 }));
  return [
    { name: 'wars: no filter', run: (d) => listAdminWars(d, { now: new Date(), limit: PAGE }) },
    { name: 'wars: status=published', run: (d) => listAdminWars(d, { now: new Date(), limit: PAGE, status: 'published' }) },
    { name: 'wars: status=closed', run: (d) => listAdminWars(d, { now: new Date(), limit: PAGE, status: 'closed' }) },
    { name: 'wars: status=draft', run: (d) => listAdminWars(d, { now: new Date(), limit: PAGE, status: 'draft' }) },
    { name: 'wars: status=removed', run: (d) => listAdminWars(d, { now: new Date(), limit: PAGE, status: 'removed' }) },
    { name: 'wars: q (common title words)', run: (d) => listAdminWars(d, { now: new Date(), limit: PAGE, q: 'pizza war 4' }) },
    { name: 'wars: q (creator name)', run: (d) => listAdminWars(d, { now: new Date(), limit: PAGE, q: 'Novak 1' }) },
    { name: 'wars: q (rare)', run: (d) => listAdminWars(d, { now: new Date(), limit: PAGE, q: 'war 49999' }) },
    { name: 'wars: cursor (deep)', run: (d) => listAdminWars(d, { now: new Date(), limit: PAGE, cursor: wc }) },
    { name: 'wars: status=published + cursor', run: (d) => listAdminWars(d, { now: new Date(), limit: PAGE, status: 'published', cursor: wc }) },
    { name: 'voters: no filter', run: (d) => listAdminVoters(d, { limit: PAGE }) },
    { name: 'voters: status=suspended', run: (d) => listAdminVoters(d, { limit: PAGE, status: 'suspended' }) },
    { name: 'voters: status=banned', run: (d) => listAdminVoters(d, { limit: PAGE, status: 'banned' }) },
    { name: 'voters: status=staff', run: (d) => listAdminVoters(d, { limit: PAGE, status: 'staff' }) },
    { name: 'voters: q', run: (d) => listAdminVoters(d, { limit: PAGE, q: 'jordan smith' }) },
    { name: 'voters: q (rare)', run: (d) => listAdminVoters(d, { limit: PAGE, q: '19999' }) },
    { name: 'voters: cursor (deep)', run: (d) => listAdminVoters(d, { limit: PAGE, cursor: vc }) },
    { name: 'voter detail (war_count)', run: (d) => findAdminVoter(d, voterId, new Date()) },
    { name: 'voter votes: first page', run: (d) => listAdminVotes(d, voterId, { limit: PAGE }) },
    { name: 'voter votes: cursor', run: (d) => listAdminVotes(d, voterId, { limit: PAGE, cursor: vvc }) },
    { name: 'moderation log: first page', run: (d) => listModerationLog(d, { limit: PAGE }) },
    { name: 'moderation log: cursor (deep)', run: (d) => listModerationLog(d, { limit: PAGE, cursor: lc }) },
  ];
}

/** Index of the migration to stop before (`--before-migration <name>`), or undefined to apply all. */
function splitIndex(beforeName: string | undefined): number | undefined {
  if (!beforeName) return undefined;
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const index = files.findIndex((f) => f.startsWith(beforeName));
  if (index < 0) throw new Error(`no migration named ${beforeName}`);
  return index;
}

async function run(url: string, pool: pg.Pool, db: Kysely<Database>, beforeName: string | undefined, showPlans: boolean): Promise<void> {
  const splitAt = splitIndex(beforeName);
  await migrate(url, splitAt);
  console.log(`Seeding ${VOTERS} voters, ${WARS} wars, ${VOTES} votes, ${REPORTS} reports, ${LOG_ROWS} log rows...`);
  await seed(pool);
  const cases = await buildCases(db);
  if (splitAt === undefined) {
    await explainAll('ALL MIGRATIONS APPLIED', pool, cases, showPlans);
    return;
  }
  await explainAll(`BEFORE ${beforeName}`, pool, cases, showPlans);
  await migrate(url);
  await pool.query('ANALYZE');
  await explainAll(`AFTER ${beforeName}`, pool, cases, showPlans);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const beforeIdx = args.indexOf('--before-migration');
  const beforeName = beforeIdx >= 0 ? args[beforeIdx + 1] : undefined;

  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  const pool = new pg.Pool({ connectionString: url });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    await run(url, pool, db, beforeName, args.includes('--plans'));
  } finally {
    await db.destroy();
    await container.stop();
  }
}

await main();
