import { Database } from 'bun:sqlite';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BACKUP_MAX_RECORD_BYTES,
  BackupValidationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  parseBackupRecordV1,
  serializeBackupManifestV1,
  serializeBackupPostRecordV1,
  serializeBackupThreadRecordV1,
  validateBackupManifestV1,
  type AppendBackupBatchResult,
  type BackupImportPort,
  type BackupImportSession,
  type BackupImportWarning,
  type CompleteBackupImportResult,
  type StartBackupImportInput,
  type StartBackupImportResult,
} from '../../core';
import { postFromRow, threadFromRow, type PostRow, type ThreadRow } from '../sqlite/rows';

const MAX_BATCH_RECORDS = 500;
const MAX_BATCH_BYTES = BACKUP_MAX_RECORD_BYTES + 1;
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const AUDIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface ImportRow {
  id: string;
  backup_sha256: string;
  manifest_json: string;
  status: 'uploading' | 'complete';
  next_sequence: number;
  phase: 'threads' | 'posts';
  last_thread_id: number;
  last_post_id: number;
  thread_count: number;
  post_count: number;
  max_records_per_batch: number;
  max_bytes_per_batch: number;
  max_record_bytes: number;
  expires_at: number;
}

interface AggregateRow {
  id: number;
  amount: number;
  first_post_at: number;
  latest_post_at: number;
  actual_amount: number;
  actual_first_post_at: number;
  actual_latest_post_at: number;
}

export class BunSqliteBackupImportService implements BackupImportPort {
  private readonly db: Database;
  private readonly now: () => number;

  constructor(filename: string, now: () => number = Date.now) {
    this.db = new Database(filename, { create: true });
    this.db.exec('PRAGMA foreign_keys = ON');
    this.now = now;
  }

  close(): void {
    this.db.close();
  }

  async getActiveSession(): Promise<BackupImportSession | null> {
    this.cleanupExpired();
    const row = this.activeRow();
    return row ? sessionFromRow(row) : null;
  }

  async isImporting(): Promise<boolean> {
    const active = this.activeRow();
    if (!active) return false;
    if (active.expires_at > this.now()) return true;
    this.cleanupExpired();
    return false;
  }

  async start(input: StartBackupImportInput): Promise<StartBackupImportResult> {
    let manifest;
    try {
      manifest = validateBackupManifestV1(input.manifest);
    } catch (error) {
      throw validationError(error);
    }
    if (!/^[0-9a-f]{64}$/.test(input.sha256)) throw new ValidationError('backup sha256 is invalid');
    const manifestJson = serializeBackupManifestV1(manifest);

    this.cleanupExpired();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const active = this.activeRow();
      if (active) {
        if (active.backup_sha256 !== input.sha256 || active.manifest_json !== manifestJson) {
          throw new ConflictError('another backup import is in progress');
        }
        this.db.exec('COMMIT');
        return this.startResult(active);
      }

      const completed = this.db
        .query<ImportRow, [string, string]>(`
          SELECT * FROM backup_imports
          WHERE status = 'complete' AND backup_sha256 = ? AND manifest_json = ?
          ORDER BY completed_at DESC LIMIT 1
        `)
        .get(input.sha256, manifestJson);
      if (completed) {
        const sequence = this.sequenceValues();
        if (
          this.digestImportedData(completed.manifest_json) === completed.backup_sha256 &&
          sequence.threads === manifest.threadIdHighWaterMark &&
          sequence.posts === manifest.postIdHighWaterMark
        ) {
          this.db.exec('COMMIT');
          return this.startResult(completed);
        }
      }

      const counts = this.db
        .query<{ threads: number; posts: number }, []>(`
        SELECT
          (SELECT COUNT(*) FROM threads) AS threads,
          (SELECT COUNT(*) FROM posts) AS posts
      `)
        .get()!;
      if (counts.threads !== 0 || counts.posts !== 0) throw new ConflictError('backup import requires an empty site');

      const id = crypto.randomUUID();
      const createdAt = this.now();
      this.db
        .query(`
        INSERT INTO backup_imports (
          id, backup_sha256, manifest_json, status,
          max_records_per_batch, max_bytes_per_batch, max_record_bytes,
          created_at, expires_at
        ) VALUES (?, ?, ?, 'uploading', ?, ?, ?, ?, ?)
      `)
        .run(
          id,
          input.sha256,
          manifestJson,
          MAX_BATCH_RECORDS,
          MAX_BATCH_BYTES,
          BACKUP_MAX_RECORD_BYTES,
          createdAt,
          createdAt + UPLOAD_TTL_MS,
        );
      const result = this.startResult(this.rowById(id)!);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async appendBatch(id: string, sequence: number, sha256: string, bytes: Uint8Array): Promise<AppendBackupBatchResult> {
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new ValidationError('batch sequence is invalid');
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new ValidationError('batch sha256 is invalid');
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BATCH_BYTES)
      throw new ValidationError('batch size is invalid');
    const actualDigest = createHash('sha256').update(bytes).digest('hex');
    if (!equalDigest(actualDigest, sha256)) throw new ValidationError('batch checksum mismatch');

    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new ValidationError('batch contains invalid UTF-8');
    }
    if (!text.endsWith('\n')) throw new ValidationError('batch must end with LF');
    const lines = text.slice(0, -1).split('\n');
    if (lines.length > MAX_BATCH_RECORDS) throw new ValidationError('batch has too many records');

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.rowById(id);
      if (!row || row.status !== 'uploading') throw new NotFoundError('backup import session not found');
      if (row.expires_at <= this.now()) throw new ConflictError('backup import session expired');
      if (sequence < row.next_sequence) {
        const existing = this.db
          .query<{ sha256: string }, [string, number]>(
            'SELECT sha256 FROM backup_import_batches WHERE import_id = ? AND sequence = ?',
          )
          .get(id, sequence);
        if (!existing || existing.sha256 !== sha256) throw new ConflictError('batch sequence has a different checksum');
        this.db.exec('COMMIT');
        return { nextSequence: row.next_sequence, threadCount: row.thread_count, postCount: row.post_count };
      }
      if (sequence !== row.next_sequence) throw new ConflictError('batch sequence is out of order');
      this.db.query("UPDATE backup_imports SET status = 'applying' WHERE id = ?").run(id);

      let phase = row.phase;
      let lastThreadId = row.last_thread_id;
      let lastPostId = row.last_post_id;
      let threadCount = row.thread_count;
      let postCount = row.post_count;
      const batchUrls = new Set<string>();

      for (const line of lines) {
        if (Buffer.byteLength(line, 'utf8') > BACKUP_MAX_RECORD_BYTES)
          throw new ValidationError('backup record exceeds 1 MiB');
        let record;
        try {
          record = parseBackupRecordV1(line);
        } catch (error) {
          throw validationError(error);
        }
        if (record.type === 'thread') {
          if (phase !== 'threads' || record.data.id <= lastThreadId)
            throw new ValidationError('thread records are out of order');
          if (
            batchUrls.has(record.data.url) ||
            this.db.query('SELECT 1 FROM threads WHERE url = ?').get(record.data.url)
          ) {
            throw new ValidationError('duplicate thread URL');
          }
          batchUrls.add(record.data.url);
          insertThread(this.db, record.data);
          lastThreadId = record.data.id;
          threadCount++;
          continue;
        }
        if (record.type === 'post') {
          phase = 'posts';
          if (record.data.id <= lastPostId) throw new ValidationError('post records are out of order');
          if (!this.db.query('SELECT 1 FROM threads WHERE id = ?').get(record.threadId)) {
            throw new ValidationError(`post ${record.data.id} references a missing thread`);
          }
          insertPost(this.db, record.threadId, record.data);
          lastPostId = record.data.id;
          postCount++;
          continue;
        }
        throw new ValidationError('batch may only contain thread and post records');
      }

      this.db
        .query(`
        UPDATE backup_imports
        SET status = 'uploading', next_sequence = ?, phase = ?, last_thread_id = ?, last_post_id = ?,
            thread_count = ?, post_count = ?
        WHERE id = ?
      `)
        .run(sequence + 1, phase, lastThreadId, lastPostId, threadCount, postCount, id);
      this.db
        .query('INSERT INTO backup_import_batches (import_id, sequence, sha256) VALUES (?, ?, ?)')
        .run(id, sequence, sha256);
      this.db.exec('COMMIT');
      return { nextSequence: sequence + 1, threadCount, postCount };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw normalizeSqliteError(error);
    }
  }

  async complete(id: string): Promise<CompleteBackupImportResult> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.rowById(id);
      if (!row || row.status !== 'uploading') throw new NotFoundError('backup import session not found');
      if (row.expires_at <= this.now()) throw new ConflictError('backup import session expired');
      const manifest = validateBackupManifestV1(JSON.parse(row.manifest_json));
      if (row.thread_count !== manifest.threadCount || row.post_count !== manifest.postCount) {
        throw new ValidationError('imported record counts do not match manifest');
      }
      if (row.last_thread_id > manifest.threadIdHighWaterMark || row.last_post_id > manifest.postIdHighWaterMark) {
        throw new ValidationError('imported ID exceeds manifest high-water mark');
      }
      const digest = this.digestImportedData(row.manifest_json);
      if (!equalDigest(digest, row.backup_sha256))
        throw new ValidationError('imported data checksum does not match backup');

      setSequence(this.db, 'threads', manifest.threadIdHighWaterMark);
      setSequence(this.db, 'posts', manifest.postIdHighWaterMark);
      const warnings = this.collectWarnings();
      const completedAt = this.now();
      this.db
        .query(`
        UPDATE backup_imports
        SET status = 'complete', completed_at = ?, expires_at = ?
        WHERE id = ?
      `)
        .run(completedAt, completedAt + AUDIT_TTL_MS, id);
      this.db.query('DELETE FROM backup_import_batches WHERE import_id = ?').run(id);
      this.db.exec('COMMIT');
      return { threadCount: row.thread_count, postCount: row.post_count, warnings };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw normalizeSqliteError(error);
    }
  }

  async abort(id: string): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.rowById(id);
      if (!row || row.status !== 'uploading') throw new NotFoundError('backup import session not found');
      this.db.query("UPDATE backup_imports SET status = 'applying' WHERE id = ?").run(id);
      this.clearImportedSite();
      this.db.query('DELETE FROM backup_imports WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private startResult(row: ImportRow): StartBackupImportResult {
    return {
      ...sessionFromRow(row),
      maxRecordsPerBatch: row.max_records_per_batch,
      maxBytesPerBatch: row.max_bytes_per_batch,
      maxRecordBytes: row.max_record_bytes,
    };
  }

  private activeRow(): ImportRow | null {
    return (
      this.db.query<ImportRow, []>("SELECT * FROM backup_imports WHERE status = 'uploading' LIMIT 1").get() ?? null
    );
  }

  private rowById(id: string): ImportRow | null {
    return this.db.query<ImportRow, [string]>('SELECT * FROM backup_imports WHERE id = ?').get(id) ?? null;
  }

  private cleanupExpired(): void {
    const now = this.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const expiredUpload = this.db
        .query<{ id: string }, [number]>(
          "SELECT id FROM backup_imports WHERE status = 'uploading' AND expires_at <= ? LIMIT 1",
        )
        .get(now);
      if (expiredUpload) {
        this.db.query("UPDATE backup_imports SET status = 'applying' WHERE id = ?").run(expiredUpload.id);
        this.clearImportedSite();
      }
      this.db.query('DELETE FROM backup_imports WHERE expires_at <= ?').run(now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private clearImportedSite(): void {
    this.db.exec('DELETE FROM posts; DELETE FROM threads;');
    this.db.query("DELETE FROM sqlite_sequence WHERE name IN ('threads', 'posts')").run();
  }

  private digestImportedData(manifestJson: string): string {
    const hash = createHash('sha256');
    hash.update(`${manifestJson}\n`);
    for (const row of this.db.query<ThreadRow, []>('SELECT * FROM threads ORDER BY id ASC').iterate()) {
      hash.update(`${serializeBackupThreadRecordV1({ type: 'thread', data: threadFromRow(row) })}\n`);
    }
    for (const row of this.db.query<PostRow, []>('SELECT * FROM posts ORDER BY id ASC').iterate()) {
      hash.update(
        `${serializeBackupPostRecordV1({ type: 'post', threadId: row.thread_id, data: postFromRow(row) })}\n`,
      );
    }
    return hash.digest('hex');
  }

  private sequenceValues(): { threads: number; posts: number } {
    const rows = this.db
      .query<{ name: string; seq: number }, []>(
        "SELECT name, seq FROM sqlite_sequence WHERE name IN ('threads', 'posts')",
      )
      .all();
    const values = new Map(rows.map((row) => [row.name, row.seq]));
    return { threads: values.get('threads') ?? 0, posts: values.get('posts') ?? 0 };
  }

  private collectWarnings(): BackupImportWarning[] {
    const rows = this.db
      .query<AggregateRow, []>(`
      SELECT t.id, t.amount, t.first_post_at, t.latest_post_at,
             COALESCE(SUM(CASE WHEN p.hidden = 0 THEN 1 ELSE 0 END), 0) AS actual_amount,
             COALESCE(MIN(p.created_at), 0) AS actual_first_post_at,
             COALESCE(MAX(p.created_at), 0) AS actual_latest_post_at
      FROM threads t
      LEFT JOIN posts p ON p.thread_id = t.id
      GROUP BY t.id
      ORDER BY t.id ASC
    `)
      .all();
    const definitions = [
      ['amount', 'amount', 'actual_amount'],
      ['firstPostAt', 'first_post_at', 'actual_first_post_at'],
      ['latestPostAt', 'latest_post_at', 'actual_latest_post_at'],
    ] as const;
    return definitions.flatMap(([type, stored, actual]) => {
      const mismatches = rows.filter((row) => row[stored] !== row[actual]);
      return mismatches.length === 0
        ? []
        : [{ type, count: mismatches.length, threadIds: mismatches.slice(0, 100).map((row) => row.id) }];
    });
  }
}

function sessionFromRow(row: ImportRow): BackupImportSession {
  return {
    id: row.id,
    backupSha256: row.backup_sha256,
    nextSequence: row.next_sequence,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

function equalDigest(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(left, 'ascii'), Buffer.from(right, 'ascii'));
}

function validationError(error: unknown): ValidationError {
  return new ValidationError(error instanceof Error ? error.message : 'backup validation failed');
}

function normalizeSqliteError(error: unknown): unknown {
  if (error instanceof BackupValidationError) return validationError(error);
  if (error instanceof Error && /UNIQUE constraint failed/.test(error.message))
    return new ValidationError('backup contains duplicate data');
  return error;
}

function insertThread(db: Database, thread: import('../../core').Thread): void {
  db.query(`
    INSERT INTO threads (id, url, title, first_post_at, latest_post_at, amount, locked)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    thread.id,
    thread.url,
    thread.title,
    thread.firstPostAt,
    thread.latestPostAt,
    thread.amount,
    thread.locked ? 1 : 0,
  );
}

function insertPost(db: Database, threadId: number, post: import('../../core').Post): void {
  db.query(`
    INSERT INTO posts (
      id, thread_id, name, email, email_hashed, website, parent, content,
      hidden, by_admin, receive_email, edit_key, created_at, updated_at,
      orig_content, avatar, rating
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    post.id,
    threadId,
    post.name,
    post.email,
    post.emailHashed,
    post.website,
    post.parent,
    post.content,
    post.hidden ? 1 : 0,
    post.byAdmin ? 1 : 0,
    post.receiveEmail ? 1 : 0,
    post.editKey,
    post.createdAt,
    post.updatedAt,
    post.origContent,
    post.avatar,
    post.rating,
  );
}

function setSequence(db: Database, name: 'threads' | 'posts', value: number): void {
  const result = db.query('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(value, name);
  if (result.changes === 0) db.query('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(name, value);
}
