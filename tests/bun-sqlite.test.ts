import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PommentCore } from '../src/core';
import { BunSqliteStorage } from '../src/runtime-bun';

let cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths) {
    rmSync(path, { recursive: true, force: true });
  }
  cleanupPaths = [];
});

describe('BunSqliteStorage', () => {
  test('persists comments across storage instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomment-next-'));
    cleanupPaths.push(dir);
    const filename = join(dir, 'pomment.db');

    const storage = new BunSqliteStorage({ filename });
    const core = new PommentCore({ storage });

    await core.createUserPost({
      slug: 'sqlite',
      url: 'https://example.com/sqlite',
      title: 'SQLite Post',
      name: 'Bob',
      email: 'bob@example.com',
      website: 'https://bob.example.com',
      content: 'persist me',
    });
    storage.close();

    const reopened = new BunSqliteStorage({ filename });
    const reopenedCore = new PommentCore({ storage: reopened });
    const result = await reopenedCore.listPublicPostsBySlug('sqlite');

    expect(result.meta.title).toBe('SQLite Post');
    expect(result.meta.amount).toBe(1);
    expect(result.post[0].content).toBe('persist me');
    expect(result.post[0].website).toBe('https://bob.example.com');
    reopened.close();
  });

  test('creates admin posts as visible admin comments', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomment-next-'));
    cleanupPaths.push(dir);
    const storage = new BunSqliteStorage({ filename: join(dir, 'pomment.db') });
    const core = new PommentCore({ storage });

    await core.createUserPost({
      slug: 'admin',
      url: 'https://example.com/admin',
      title: 'Admin Post',
      name: 'User',
      email: 'user@example.com',
      content: 'first',
    });

    const thread = await core.getThreadMetaBySlug('admin');

    const adminPost = await core.createAdminPost({
      threadId: thread.id,
      name: 'Admin',
      email: 'admin@example.com',
      content: 'reply',
    });

    expect(adminPost.byAdmin).toBe(true);
    expect(adminPost.hidden).toBe(false);

    const result = await core.listPublicPostsById(thread.id);
    expect(result.meta.amount).toBe(2);
    expect(result.post.map((post) => post.content)).toEqual(['first', 'reply']);
    storage.close();
  });
});
