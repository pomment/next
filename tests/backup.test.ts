import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_SOURCE_SCHEMA_VERSION,
  serializeBackupManifestV1,
  serializeBackupPostRecordV1,
  serializeBackupThreadRecordV1,
  type BackupManifestV1,
} from '../src/core';
import { exportBunSqliteBackup, scanBunBackup } from '../src/runtime-bun';
import { schemaSql } from '../src/runtime-bun/sqlite/schema';

let cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths) rmSync(path, { recursive: true, force: true });
  cleanupPaths = [];
});

function tempFiles(): { databasePath: string; backupPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pomment-backup-'));
  cleanupPaths.push(dir);
  return { databasePath: join(dir, 'pomment.db'), backupPath: join(dir, 'backup.jsonl.gz') };
}

function seedDatabase(path: string): void {
  const db = new Database(path, { create: true });
  db.exec(schemaSql);
  db.query(`
    INSERT INTO threads (id, url, title, first_post_at, latest_post_at, amount, locked)
    VALUES (3, 'https://example.com/a', 'A', 0, 0, 1, 0),
           (8, 'https://example.com/b', 'B', 0, 0, 0, 1)
  `).run();
  db.query(`
    INSERT INTO posts (
      id, thread_id, name, email, email_hashed, website, parent, content,
      hidden, by_admin, receive_email, edit_key, created_at, updated_at,
      orig_content, avatar, rating
    ) VALUES (5, 3, 'N', 'e@example.com', 'hash', '', 999, 'hello',
              0, 0, 1, 'key', 0, 20, 'hello', '', 1.5)
  `).run();
  db.close();
}

function writeArchive(path: string, dataLines: string[], trailerHash?: string): void {
  const data = `${dataLines.join('\n')}\n`;
  const sha256 = trailerHash ?? createHash('sha256').update(data).digest('hex');
  writeFileSync(path, gzipSync(`${data}{"type":"trailer","sha256":"${sha256}"}\n`));
}

function fixtureRecords(): { manifest: BackupManifestV1; thread: string; post: string } {
  const manifest: BackupManifestV1 = {
    type: 'manifest',
    formatVersion: BACKUP_FORMAT_VERSION,
    sourceSchemaVersion: BACKUP_SOURCE_SCHEMA_VERSION,
    generatorVersion: 'test',
    exportedAt: 1,
    threadCount: 1,
    postCount: 1,
    threadIdHighWaterMark: 1,
    postIdHighWaterMark: 1,
  };
  return {
    manifest,
    thread: serializeBackupThreadRecordV1({
      type: 'thread',
      data: { title: 'T', firstPostAt: 2, latestPostAt: 2, amount: 1, id: 1, locked: false, url: 'u' },
    }),
    post: serializeBackupPostRecordV1({
      type: 'post',
      threadId: 1,
      data: {
        id: 1,
        name: 'N',
        email: 'e',
        emailHashed: 'h',
        website: '',
        parent: 50,
        content: 'c',
        hidden: false,
        byAdmin: false,
        receiveEmail: false,
        editKey: 'k',
        createdAt: 2,
        updatedAt: 2,
        origContent: 'c',
        avatar: '',
        rating: 0,
      },
    }),
  };
}

describe('v1 backup', () => {
  test('exports and verifies a canonical streaming SQLite backup', async () => {
    const paths = tempFiles();
    seedDatabase(paths.databasePath);

    const exported = await exportBunSqliteBackup({
      ...paths,
      outputPath: paths.backupPath,
      generatorVersion: 'test-generator',
      exportedAt: 1234,
      pageSize: 1,
    });
    const scanned = await scanBunBackup(paths.backupPath);
    const lines = gunzipSync(readFileSync(paths.backupPath)).toString('utf8').split('\n');

    expect(scanned.manifest).toEqual(exported.manifest);
    expect(scanned.trailer).toEqual(exported.trailer);
    expect(scanned.manifest).toMatchObject({
      threadCount: 2,
      postCount: 1,
      threadIdHighWaterMark: 8,
      postIdHighWaterMark: 5,
    });
    expect(scanned.warnings).toEqual([]);
    expect(lines[0]).toBe(serializeBackupManifestV1(exported.manifest));
    expect(lines.map((line) => (line ? JSON.parse(line).type : ''))).toEqual([
      'manifest',
      'thread',
      'thread',
      'post',
      'trailer',
      '',
    ]);
  });

  test('rejects a checksum mismatch', async () => {
    const { backupPath } = tempFiles();
    const fixture = fixtureRecords();
    writeArchive(
      backupPath,
      [serializeBackupManifestV1(fixture.manifest), fixture.thread, fixture.post],
      '0'.repeat(64),
    );
    await expect(scanBunBackup(backupPath)).rejects.toThrow('checksum mismatch');
  });

  test('rejects noncanonical JSON even with a matching checksum', async () => {
    const { backupPath } = tempFiles();
    const fixture = fixtureRecords();
    const manifest = ` ${serializeBackupManifestV1(fixture.manifest)}`;
    writeArchive(backupPath, [manifest, fixture.thread, fixture.post]);
    await expect(scanBunBackup(backupPath)).rejects.toThrow('not canonical');
  });

  test('rejects posts whose thread is absent', async () => {
    const { backupPath } = tempFiles();
    const fixture = fixtureRecords();
    const missingThreadManifest = serializeBackupManifestV1({ ...fixture.manifest, threadCount: 0 });
    writeArchive(backupPath, [missingThreadManifest, fixture.post]);
    await expect(scanBunBackup(backupPath)).rejects.toThrow('references a missing thread');
  });

  test('reports stored metadata inconsistencies without rejecting the archive', async () => {
    const { backupPath } = tempFiles();
    const fixture = fixtureRecords();
    const inconsistentThread = serializeBackupThreadRecordV1({
      type: 'thread',
      data: { title: 'T', firstPostAt: 9, latestPostAt: 9, amount: 0, id: 1, locked: false, url: 'u' },
    });
    writeArchive(backupPath, [serializeBackupManifestV1(fixture.manifest), inconsistentThread, fixture.post]);
    const result = await scanBunBackup(backupPath);
    expect(result.warnings).toEqual([
      { type: 'amount', count: 1, threadIds: [1] },
      { type: 'firstPostAt', count: 1, threadIds: [1] },
      { type: 'latestPostAt', count: 1, threadIds: [1] },
    ]);
  });
});
