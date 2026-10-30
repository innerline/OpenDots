import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';
import { Runner } from '../src/server/runner.js';
import type { Config } from '../src/server/research.js';

const stores: Store[] = [];
const config: Config = { mode: 'sample', baseUrl: 'https://api.openai.com/v1' };
function fixture(inboxPath?: string, token?: string) {
  const store = new Store(':memory:');
  stores.push(store);
  const runner = new Runner(store, config);
  return createApp({
    store,
    runner,
    config,
    ownerToken: token,
    ownerInboxPath: inboxPath,
  });
}
afterEach(() => stores.splice(0).forEach((store) => store.close()));
describe('owner inbox', () => {
  it('serves the ask register from the configured file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'owner-inbox-'));
    const ask = {
      id: 'planning-loop-standing',
      for: 'honey',
      title: 'Make planning permanent',
      body: 'The workflow worked.',
      how: 'Reply in this chat: standing or change.',
      added: '2026-10-29',
    };
    await writeFile(
      join(dir, 'owner-inbox.json'),
      JSON.stringify({
        $comment: 'extra keys are ignored',
        updated: '2026-10-30T10:45:00Z',
        asks: [ask],
        whenever: ['iPad one-time setup'],
      }),
    );
    const app = fixture(join(dir, 'owner-inbox.json'));
    const response = await app.request('/api/owner-inbox');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      asks: [ask],
      whenever: ['iPad one-time setup'],
    });
    await rm(dir, { recursive: true, force: true });
  });
  it('returns an empty inbox when unset, unreadable, or malformed', async () => {
    expect(await (await fixture().request('/api/owner-inbox')).json()).toEqual({
      asks: [],
      whenever: [],
    });
    const missing = await fixture('/nonexistent/owner-inbox.json').request(
      '/api/owner-inbox',
    );
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ asks: [], whenever: [] });
    const dir = await mkdtemp(join(tmpdir(), 'owner-inbox-'));
    const malformed = join(dir, 'owner-inbox.json');
    await writeFile(malformed, '{"asks": "not a list"}');
    expect(
      await (await fixture(malformed).request('/api/owner-inbox')).json(),
    ).toEqual({ asks: [], whenever: [] });
    await rm(dir, { recursive: true, force: true });
  });
  it('reflects file updates without a restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'owner-inbox-'));
    const path = join(dir, 'owner-inbox.json');
    await writeFile(path, JSON.stringify({ asks: [], whenever: [] }));
    const app = fixture(path);
    expect(await (await app.request('/api/owner-inbox')).json()).toEqual({
      asks: [],
      whenever: [],
    });
    await writeFile(
      path,
      JSON.stringify({ asks: [], whenever: ['a fresh item'] }),
    );
    expect(await (await app.request('/api/owner-inbox')).json()).toEqual({
      asks: [],
      whenever: ['a fresh item'],
    });
    await rm(dir, { recursive: true, force: true });
  });
  it('requires the owner token like every other API route', async () => {
    const app = fixture(undefined, 'private-token');
    expect((await app.request('/api/owner-inbox')).status).toBe(401);
    expect(
      (
        await app.request('/api/owner-inbox', {
          headers: { Authorization: 'Bearer private-token' },
        })
      ).status,
    ).toBe(200);
  });
});
