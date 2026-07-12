import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_MAX_RECORD_BYTES,
  BACKUP_SOURCE_SCHEMA_VERSION,
  serializeBackupManifestV1,
  serializeBackupPostRecordV1,
  serializeBackupThreadRecordV1,
  serializeBackupTrailerV1,
  type BackupManifestV1,
  type BackupTrailerV1,
} from '../../core/backup/v1';
import { postFromRow, threadFromRow, type PostRow, type ThreadRow } from '../sqlite/rows';

export interface BunSqliteBackupExportOptions {
  databasePath: string;
  outputPath: string;
  generatorVersion: string;
  exportedAt?: number;
  pageSize?: number;
}

export interface BunSqliteBackupExportResult {
  manifest: BackupManifestV1;
  trailer: BackupTrailerV1;
}

interface CountRow {
  count: number;
}
interface SequenceRow {
  seq: number;
}

export async function exportBunSqliteBackup(
  options: BunSqliteBackupExportOptions,
): Promise<BunSqliteBackupExportResult> {
  const pageSize = options.pageSize ?? 500;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be a positive safe integer');

  const db = new Database(options.databasePath, { readonly: true });
  let transactionOpen = false;
  let result: BunSqliteBackupExportResult | undefined;
  try {
    const schemaVersion = db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;
    if (schemaVersion !== BACKUP_SOURCE_SCHEMA_VERSION) {
      throw new Error(`unsupported SQLite schema version: ${schemaVersion}`);
    }
    db.exec('BEGIN');
    transactionOpen = true;
    const threadCount = db.query<CountRow, []>('SELECT COUNT(*) AS count FROM threads').get()!.count;
    const postCount = db.query<CountRow, []>('SELECT COUNT(*) AS count FROM posts').get()!.count;
    const sequence = db
      .query<SequenceRow & { name: string }, []>(
        "SELECT name, seq FROM sqlite_sequence WHERE name IN ('threads', 'posts')",
      )
      .all();
    const sequenceByName = new Map(sequence.map((row) => [row.name, row.seq]));
    const manifest: BackupManifestV1 = {
      type: 'manifest',
      formatVersion: BACKUP_FORMAT_VERSION,
      sourceSchemaVersion: BACKUP_SOURCE_SCHEMA_VERSION,
      generatorVersion: options.generatorVersion,
      exportedAt: options.exportedAt ?? Date.now(),
      threadCount,
      postCount,
      threadIdHighWaterMark: sequenceByName.get('threads') ?? 0,
      postIdHighWaterMark: sequenceByName.get('posts') ?? 0,
    };
    const hash = createHash('sha256');

    async function* records(): AsyncGenerator<Uint8Array> {
      const emitData = (text: string): Uint8Array => {
        const bytes = Buffer.from(`${text}\n`, 'utf8');
        if (bytes.byteLength - 1 > BACKUP_MAX_RECORD_BYTES) throw new Error('backup record exceeds 1 MiB');
        hash.update(bytes);
        return bytes;
      };

      yield emitData(serializeBackupManifestV1(manifest));
      let lastThreadId = 0;
      while (true) {
        const rows = db
          .query<ThreadRow, [number, number]>('SELECT * FROM threads WHERE id > ? ORDER BY id ASC LIMIT ?')
          .all(lastThreadId, pageSize);
        if (rows.length === 0) break;
        for (const row of rows) {
          lastThreadId = row.id;
          yield emitData(serializeBackupThreadRecordV1({ type: 'thread', data: threadFromRow(row) }));
        }
      }

      let lastPostId = 0;
      while (true) {
        const rows = db
          .query<PostRow, [number, number]>('SELECT * FROM posts WHERE id > ? ORDER BY id ASC LIMIT ?')
          .all(lastPostId, pageSize);
        if (rows.length === 0) break;
        for (const row of rows) {
          lastPostId = row.id;
          yield emitData(
            serializeBackupPostRecordV1({ type: 'post', threadId: row.thread_id, data: postFromRow(row) }),
          );
        }
      }

      const trailer: BackupTrailerV1 = { type: 'trailer', sha256: hash.digest('hex') };
      result = { manifest, trailer };
      const trailerBytes = Buffer.from(`${serializeBackupTrailerV1(trailer)}\n`, 'utf8');
      if (trailerBytes.byteLength - 1 > BACKUP_MAX_RECORD_BYTES) throw new Error('backup record exceeds 1 MiB');
      yield trailerBytes;
    }

    await pipeline(Readable.from(records()), createGzip(), createWriteStream(options.outputPath));
    db.exec('COMMIT');
    transactionOpen = false;
    return result!;
  } catch (error) {
    if (transactionOpen) db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}
