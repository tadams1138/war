import { describe, expect, it, beforeEach } from 'vitest';
import { createMcpServer } from '../../src/mcp/server.js';
import { buildCommonDeps } from '../setup/testApp.js';
import { getTestDb, truncateAll } from '../setup/testDb.js';
import { connectMcpTestClient, parseToolResult } from '../setup/mcpTestClient.js';
import {
  activateWarForTest,
  joinWarAsVoter,
  makeContestant,
  makeDraftWar,
  makeDraftWarWithContestants,
  makeVoter,
} from '../setup/fixtures.js';
import { getWar } from '../../src/wars/warsService.js';
import { listContestantsByWar } from '../../src/contestants/contestantsRepository.js';

/**
 * Spec §7.9's "MCP Tool Surface" and "Service-Layer Allowlist" Gherkin
 * (§14): each tool handler calls the identical service-layer function its
 * REST route counterpart calls, so a real test database (not a mock) is the
 * only honest way to prove the tool call produced the state a REST call
 * would have -- per §7.9's own "Testing" subsection, tools are exercised
 * over a real `McpServer`/`Client` pair connected by
 * `InMemoryTransport.createLinkedPair()`, with no second HTTP hop to mock.
 */
describe('MCP Tool Surface (spec §7.9, §14)', () => {
  const deps = buildCommonDeps();

  beforeEach(async () => {
    await truncateAll();
  });

  it('create_war sends only the fields supplied, and its stored media_mode is the API\'s own default', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, voter.id);

    // Act
    const result = await client.callTool({ name: 'create_war', arguments: { title: 'A New War' } });
    const created = parseToolResult<{ id: string; title: string; media_mode: string }>(result);

    // Assert: the War really exists via the same service function REST uses.
    const lookup = await getWar(db, created.id);
    expect(lookup.kind).toBe('found');
    expect(created.title).toBe('A New War');
    expect(created.media_mode).toBe('image');
  });

  it('update_war on a War the caller does not own is rejected exactly as PATCH /wars/:id would reject it', async () => {
    // Arrange
    const db = await getTestDb();
    const voterA = await makeVoter(db, 'voter-a');
    const voterB = await makeVoter(db, 'voter-b');
    const war = await makeDraftWar(db, voterA.id, { title: "Voter A's War" });
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, voterB.id);

    // Act
    const result = await client.callTool({ name: 'update_war', arguments: { war_id: war.id, title: 'Hijacked' } });

    // Assert
    expect(result.isError).toBe(true);
    const lookup = await getWar(db, war.id);
    expect(lookup.kind).toBe('found');
    expect(lookup.kind === 'found' && lookup.war.title).toBe("Voter A's War");
  });

  it('activate_war surfaces the existing activation rules and the War remains in draft status', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const war = await makeDraftWar(db, voter.id, { title: 'Too Few Contestants' });
    await makeContestant(db, war.id, 'Solo Contestant');
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, voter.id);

    // Act
    const result = await client.callTool({ name: 'activate_war', arguments: { war_id: war.id } });

    // Assert
    expect(result.isError).toBe(true);
    const lookup = await getWar(db, war.id);
    expect(lookup.kind === 'found' && lookup.war.status).toBe('draft');
  });

  it('list_my_wars with no arguments returns every status, including drafts', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const draft = await makeDraftWar(db, voter.id, { title: 'Draft War' });
    const { war: activeWar } = await makeDraftWarWithContestants(db, deps.storage, voter.id, 2, { title: 'Active War' });
    const active = await activateWarForTest(db, activeWar);
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, voter.id);

    // Act
    const result = await client.callTool({ name: 'list_my_wars', arguments: {} });
    const wars = parseToolResult<Array<{ id: string; status: string }>>(result);

    // Assert
    expect(wars.map((war) => war.id).sort()).toEqual([draft.id, active.id].sort());
  });

  it('list_my_wars does not return another voter\'s Wars', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'lonely-voter');
    const other = await makeVoter(db, 'other-voter');
    const { war: otherWar } = await makeDraftWarWithContestants(db, deps.storage, other.id, 2, { title: "Someone Else's War" });
    await activateWarForTest(db, otherWar);
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, voter.id);

    // Act
    const result = await client.callTool({ name: 'list_my_wars', arguments: {} });
    const wars = parseToolResult<Array<{ id: string }>>(result);

    // Assert
    expect(wars.map((war) => war.id)).not.toContain(otherWar.id);
  });

  it('get_war returns a War by id with no ownership check applied, matching GET /wars/:id exactly', async () => {
    // Arrange
    const db = await getTestDb();
    const owner = await makeVoter(db, 'owner');
    const anyone = await makeVoter(db, 'anyone-else');
    const war = await makeDraftWar(db, owner.id, { title: "Owner's Draft War" });
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, anyone.id);

    // Act
    const result = await client.callTool({ name: 'get_war', arguments: { war_id: war.id } });
    const detail = parseToolResult<{ id: string; title: string }>(result);

    // Assert
    expect(result.isError).toBeFalsy();
    expect(detail.id).toBe(war.id);
    expect(detail.title).toBe("Owner's Draft War");
  });

  it('add_contestant rejects an attribute the War\'s schema does not declare, and creates no contestant', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const war = await makeDraftWar(db, voter.id, { title: 'Schema War', contestantSchema: [] });
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, voter.id);

    // Act
    const result = await client.callTool({
      name: 'add_contestant',
      arguments: { war_id: war.id, name: 'Nope', attributes: { country: 'Brazil' } },
    });

    // Assert
    expect(result.isError).toBe(true);
    const contestants = await listContestantsByWar(db, war.id);
    expect(contestants).toEqual([]);
  });

  it('upload_image decodes and stores the provided image via the same function the multipart route uses', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const war = await makeDraftWar(db, voter.id, { title: 'Image War' });
    const contestant = await makeContestant(db, war.id, 'Solo Contestant');
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, voter.id);
    const sharp = (await import('sharp')).default;
    const jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .jpeg()
      .toBuffer();

    // Act
    const result = await client.callTool({
      name: 'upload_image',
      arguments: {
        war_id: war.id,
        contestant_id: contestant.id,
        image_base64: jpeg.toString('base64'),
        mime_type: 'image/jpeg',
      },
    });
    const stored = parseToolResult<{ id: string; display_order: number }>(result);

    // Assert
    expect(result.isError).toBeFalsy();
    expect(stored.display_order).toBe(0);
  });

  it('upload_image rejects a payload over the size limit exactly as the multipart route rejects an oversized upload', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const war = await makeDraftWar(db, voter.id, { title: 'Oversized Image War' });
    const contestant = await makeContestant(db, war.id, 'Solo Contestant');
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, voter.id);
    const oversized = Buffer.alloc(11 * 1024 * 1024, 1);

    // Act
    const result = await client.callTool({
      name: 'upload_image',
      arguments: {
        war_id: war.id,
        contestant_id: contestant.id,
        image_base64: oversized.toString('base64'),
        mime_type: 'image/jpeg',
      },
    });

    // Assert
    expect(result.isError).toBe(true);
  });

  it('get_rankings returns a public War\'s leaderboard, the same order GET /wars/:id/rankings would return', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const anyone = await makeVoter(db, 'anyone-else');
    const { war, contestants } = await makeDraftWarWithContestants(db, deps.storage, voter.id, 2, { title: 'Ranked War' });
    const active = await activateWarForTest(db, war);
    await db.updateTable('contestants').set({ win_count: 3, appearance_count: 3 }).where('id', '=', contestants[0]!.id).execute();
    await db.updateTable('contestants').set({ win_count: 1, appearance_count: 3 }).where('id', '=', contestants[1]!.id).execute();
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, anyone.id);

    // Act
    const result = await client.callTool({ name: 'get_rankings', arguments: { war_id: active.id } });
    const view = parseToolResult<{ rankings: Array<{ rank: number | null; contestant: { id: string } }> }>(result);

    // Assert
    expect(result.isError).toBeFalsy();
    expect(view.rankings[0]!.contestant.id).toBe(contestants[0]!.id);
    expect(view.rankings[0]!.rank).toBe(1);
  });

  it('get_rankings on an invite-only War rejects a non-member exactly as GET /wars/:id/rankings rejects that same voter', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const outsider = await makeVoter(db, 'outsider');
    const { war } = await makeDraftWarWithContestants(db, deps.storage, voter.id, 2, {
      title: 'Invite Only War',
      visibility: 'invite_only',
    });
    const active = await activateWarForTest(db, war);
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, outsider.id);

    // Act
    const result = await client.callTool({ name: 'get_rankings', arguments: { war_id: active.id } });

    // Assert
    expect(result.isError).toBe(true);
  });

  it('get_rankings succeeds for a member of an invite-only War', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const member = await makeVoter(db, 'member');
    const { war } = await makeDraftWarWithContestants(db, deps.storage, voter.id, 2, {
      title: 'Invite Only War, Member Access',
      visibility: 'invite_only',
    });
    const active = await activateWarForTest(db, war);
    await joinWarAsVoter(db, active.id, member.id);
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, member.id);

    // Act
    const result = await client.callTool({ name: 'get_rankings', arguments: { war_id: active.id } });

    // Assert
    expect(result.isError).toBeFalsy();
  });

  it('update_contestant updates a contestant on the creator\'s own draft War', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const war = await makeDraftWar(db, voter.id, { title: 'Contestant Edit War' });
    const contestant = await makeContestant(db, war.id, 'Original Name');
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, voter.id);

    // Act
    const result = await client.callTool({
      name: 'update_contestant',
      arguments: { war_id: war.id, contestant_id: contestant.id, name: 'Renamed' },
    });
    const updated = parseToolResult<{ name: string }>(result);

    // Assert
    expect(result.isError).toBeFalsy();
    expect(updated.name).toBe('Renamed');
  });

  it('close_war closes an active War the caller owns', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const { war } = await makeDraftWarWithContestants(db, deps.storage, voter.id, 2, { title: 'War To Close' });
    const active = await activateWarForTest(db, war);
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, voter.id);

    // Act
    const result = await client.callTool({ name: 'close_war', arguments: { war_id: active.id } });
    const closed = parseToolResult<{ status: string }>(result);

    // Assert
    expect(result.isError).toBeFalsy();
    expect(closed.status).toBe('closed');
  });

  it('exposes exactly the ten tools named in spec §7.9, and no vote-reaching tool among them', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const server = createMcpServer({ db, storage: deps.storage, publicBaseUrl: deps.config.s3.publicBaseUrl });
    const client = await connectMcpTestClient(server, voter.id);

    // Act
    const { tools } = await client.listTools();

    // Assert
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [
        'create_war',
        'update_war',
        'activate_war',
        'close_war',
        'list_my_wars',
        'get_war',
        'add_contestant',
        'update_contestant',
        'upload_image',
        'get_rankings',
      ].sort(),
    );
  });
});
