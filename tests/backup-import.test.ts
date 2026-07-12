import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdminAuth, type AdminPasswordVerifier, type PommentCore } from '../src/core';
import { createHandler } from '../src/entry-bun/routes';
import {
  BunSqliteBackupImportService,
  BunSqliteStorage,
  MemoryAdminAuthStore,
  exportBunSqliteBackup,
  scanBunBackup,
} from '../src/runtime-bun';
import { schemaSql } from '../src/runtime-bun/sqlite/schema';

const origin = 'https://admin.example.com';
let cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths) rmSync(path, { recursive: true, force: true });
  cleanupPaths = [];
});

class PasswordVerifier implements AdminPasswordVerifier {
  async verify(password: string): Promise<boolean> {
    return password === 'correct horse battery staple';
  }
}

function temporaryPaths(): { source: string; target: string; backup: string } {
  const directory = mkdtempSync(join(tmpdir(), 'pomment-restore-'));
  cleanupPaths.push(directory);
  return {
    source: join(directory, 'source.db'),
    target: join(directory, 'target.db'),
    backup: join(directory, 'backup.jsonl.gz'),
  };
}

function seedSource(path: string): void {
  const db = new Database(path, { create: true });
  db.exec(schemaSql);
  db.query(`
    INSERT INTO threads (id, url, title, first_post_at, latest_post_at, amount, locked)
    VALUES (7, 'https://example.com/thread', 'Thread', 10, 10, 1, 1)
  `).run();
  db.query(`
    INSERT INTO posts (
      id, thread_id, name, email, email_hashed, website, parent, content,
      hidden, by_admin, receive_email, edit_key, created_at, updated_at,
      orig_content, avatar, rating
    ) VALUES (11, 7, 'Name', 'private@example.com', 'hash', '', 999, 'content',
              0, 0, 1, 'secret-edit-key', 10, 12, 'original', '', 1.25)
  `).run();
  db.query("UPDATE sqlite_sequence SET seq = 20 WHERE name = 'threads'").run();
  db.query("UPDATE sqlite_sequence SET seq = 30 WHERE name = 'posts'").run();
  db.close();
}

async function authenticatedHandler(databasePath: string) {
  const storage = new BunSqliteStorage({ filename: databasePath });
  const backupImport = new BunSqliteBackupImportService(databasePath);
  const authStore = new MemoryAdminAuthStore();
  const adminAuth = new AdminAuth({
    passwordVerifier: new PasswordVerifier(),
    sessionStore: authStore,
    loginAttemptStore: authStore,
    authVersion: 'version-1',
  });
  const rawHandler = createHandler({} as PommentCore, { adminAuth, adminOrigin: origin, backupImport });
  const handler = (request: Request) => rawHandler(request, { clientIp: '192.0.2.1' });
  const login = await handler(new Request(`${origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ password: 'correct horse battery staple' }),
  }));
  const cookie = login.headers.get('set-cookie')!.split(';', 1)[0];
  return { storage, backupImport, handler, cookie };
}

function adminRequest(path: string, cookie: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('cookie', cookie);
  headers.set('origin', origin);
  return new Request(`${origin}${path}`, { ...init, headers });
}

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json() as { code: number; data: T };
  expect(response.status).toBe(200);
  expect(body.code).toBe(200);
  return body.data;
}

describe('backup import', () => {
  test('restores a verified backup through resumable authenticated batches', async () => {
    const paths = temporaryPaths();
    seedSource(paths.source);
    await exportBunSqliteBackup({ databasePath: paths.source, outputPath: paths.backup, generatorVersion: 'test' });
    const verified = await scanBunBackup(paths.backup);
    const target = await authenticatedHandler(paths.target);

    const session = await responseData<{ id: string; nextSequence: number }>(await target.handler(adminRequest(
      '/api/admin/backup/import',
      target.cookie,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manifest: verified.manifest, sha256: verified.trailer.sha256 }),
      },
    )));
    expect(await target.backupImport.isImporting()).toBe(true);
    await expect(target.storage.transaction(storage => storage.createThread({
      id: 0,
      url: 'https://example.com/race',
      title: 'Race',
      firstPostAt: 0,
      latestPostAt: 0,
      amount: 0,
      locked: false,
    }))).rejects.toMatchObject({ status: 503 });

    const unavailable = await target.handler(new Request(`${origin}/api/public/posts/7`));
    expect(unavailable.status).toBe(503);
    const unavailableAdmin = await target.handler(adminRequest('/api/admin/thread/list', target.cookie));
    expect(unavailableAdmin.status).toBe(503);

    const lines: string[] = [];
    await scanBunBackup(paths.backup, { onDataRecord: (_record, line) => { lines.push(line); } });
    const bytes = new TextEncoder().encode(`${lines.join('\n')}\n`);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const batchRequest = () => adminRequest(
      `/api/admin/backup/import/${session.id}/batches/0`,
      target.cookie,
      { method: 'PUT', body: bytes, headers: { 'x-pomment-batch-sha256': digest } },
    );
    const firstBatch = await responseData<{ nextSequence: number }>(await target.handler(batchRequest()));
    const retriedBatch = await responseData<{ nextSequence: number }>(await target.handler(batchRequest()));
    expect(firstBatch.nextSequence).toBe(1);
    expect(retriedBatch.nextSequence).toBe(1);

    const completed = await responseData<{ threadCount: number; postCount: number }>(await target.handler(adminRequest(
      `/api/admin/backup/import/${session.id}/complete`,
      target.cookie,
      { method: 'POST' },
    )));
    expect(completed).toMatchObject({ threadCount: 1, postCount: 1 });
    expect(await target.backupImport.isImporting()).toBe(false);

    const db = new Database(paths.target, { readonly: true });
    expect(db.query('SELECT id, url, locked FROM threads').get()).toEqual({ id: 7, url: 'https://example.com/thread', locked: 1 });
    expect(db.query('SELECT id, thread_id, email, parent, edit_key FROM posts').get()).toEqual({
      id: 11,
      thread_id: 7,
      email: 'private@example.com',
      parent: 999,
      edit_key: 'secret-edit-key',
    });
    expect(db.query("SELECT name, seq FROM sqlite_sequence WHERE name IN ('threads', 'posts') ORDER BY name").all()).toEqual([
      { name: 'posts', seq: 30 },
      { name: 'threads', seq: 20 },
    ]);
    db.close();
    await target.storage.transaction(storage => storage.createThread({
      id: 0,
      url: 'https://example.com/after-restore',
      title: 'After restore',
      firstPostAt: 0,
      latestPostAt: 0,
      amount: 0,
      locked: false,
    }));
    await expect(target.backupImport.start({
      manifest: verified.manifest,
      sha256: verified.trailer.sha256,
    })).rejects.toMatchObject({ status: 409 });
    target.backupImport.close();
    target.storage.close();
  });

  test('aborts a partial import and restores an empty target', async () => {
    const paths = temporaryPaths();
    seedSource(paths.source);
    await exportBunSqliteBackup({ databasePath: paths.source, outputPath: paths.backup, generatorVersion: 'test' });
    const verified = await scanBunBackup(paths.backup);
    const storage = new BunSqliteStorage({ filename: paths.target });
    const service = new BunSqliteBackupImportService(paths.target);
    const session = await service.start({ manifest: verified.manifest, sha256: verified.trailer.sha256 });
    const lines: string[] = [];
    await scanBunBackup(paths.backup, { onDataRecord: (record, line) => { if (record.type === 'thread') lines.push(line); } });
    const bytes = new TextEncoder().encode(`${lines.join('\n')}\n`);
    await service.appendBatch(session.id, 0, createHash('sha256').update(bytes).digest('hex'), bytes);

    await service.abort(session.id);

    const db = new Database(paths.target, { readonly: true });
    expect(db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM threads').get()!.count).toBe(0);
    expect(db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM posts').get()!.count).toBe(0);
    db.close();
    service.close();
    storage.close();
  });

  test('cleans an expired partial import before reopening the site', async () => {
    const paths = temporaryPaths();
    seedSource(paths.source);
    await exportBunSqliteBackup({ databasePath: paths.source, outputPath: paths.backup, generatorVersion: 'test' });
    const verified = await scanBunBackup(paths.backup);
    const storage = new BunSqliteStorage({ filename: paths.target });
    let now = 1_000;
    const service = new BunSqliteBackupImportService(paths.target, () => now);
    const session = await service.start({ manifest: verified.manifest, sha256: verified.trailer.sha256 });
    const lines: string[] = [];
    await scanBunBackup(paths.backup, { onDataRecord: (record, line) => { if (record.type === 'thread') lines.push(line); } });
    const bytes = new TextEncoder().encode(`${lines.join('\n')}\n`);
    await service.appendBatch(session.id, 0, createHash('sha256').update(bytes).digest('hex'), bytes);

    now += 24 * 60 * 60 * 1000 + 1;
    expect(await service.isImporting()).toBe(false);

    const db = new Database(paths.target, { readonly: true });
    expect(db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM threads').get()!.count).toBe(0);
    expect(db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM backup_imports').get()!.count).toBe(0);
    db.close();
    service.close();
    storage.close();
  });
});
