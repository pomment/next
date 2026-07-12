import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import {
  BACKUP_MAX_RECORD_BYTES,
  BackupValidationError,
  parseBackupRecordV1,
  type BackupManifestV1,
  type BackupRecordV1,
  type BackupTrailerV1,
} from '../../core/backup/v1';
import type { Thread } from '../../core/domain/thread';

export type BackupSemanticWarningType = 'amount' | 'firstPostAt' | 'latestPostAt';

export interface BackupSemanticWarningSummary {
  type: BackupSemanticWarningType;
  count: number;
  threadIds: number[];
}

export interface BunBackupScanResult {
  manifest: BackupManifestV1;
  trailer: BackupTrailerV1;
  warnings: BackupSemanticWarningSummary[];
}

export interface BunBackupScanOptions {
  onDataRecord?: (record: BackupRecordV1, canonicalLine: string) => void | Promise<void>;
}

interface ThreadSummary {
  thread: Thread;
  postCount: number;
  visiblePostCount: number;
  firstPostAt: number;
  latestPostAt: number;
}

export async function scanBunBackup(path: string, options: BunBackupScanOptions = {}): Promise<BunBackupScanResult> {
  const hash = createHash('sha256');
  const threadUrls = new Set<string>();
  const summaries = new Map<number, ThreadSummary>();
  let manifest: BackupManifestV1 | undefined;
  let trailer: BackupTrailerV1 | undefined;
  let threadCount = 0;
  let postCount = 0;
  let lastThreadId = 0;
  let lastPostId = 0;
  let phase: 'manifest' | 'threads' | 'posts' | 'trailer' = 'manifest';

  for await (const lineBytes of gzipLines(path)) {
    const text = decodeLine(lineBytes);
    const record = parseBackupRecordV1(text);

    if (record.type === 'manifest') {
      if (phase !== 'manifest') throw new BackupValidationError('manifest must be the first record');
      manifest = record;
      phase = 'threads';
      hash.update(lineBytes);
      hash.update('\n');
      continue;
    }
    if (!manifest) throw new BackupValidationError('manifest must be the first record');

    if (record.type === 'thread') {
      if (phase !== 'threads') throw new BackupValidationError('thread records are out of order');
      if (record.data.id <= lastThreadId) throw new BackupValidationError('thread IDs must be strictly ascending');
      if (threadUrls.has(record.data.url)) throw new BackupValidationError('duplicate thread URL');
      lastThreadId = record.data.id;
      threadUrls.add(record.data.url);
      summaries.set(record.data.id, {
        thread: record.data,
        postCount: 0,
        visiblePostCount: 0,
        firstPostAt: 0,
        latestPostAt: 0,
      });
      threadCount++;
      hash.update(lineBytes);
      hash.update('\n');
      await options.onDataRecord?.(record, text);
      continue;
    }

    if (record.type === 'post') {
      if (phase === 'trailer') throw new BackupValidationError('post record follows trailer');
      phase = 'posts';
      if (record.data.id <= lastPostId) throw new BackupValidationError('post IDs must be strictly ascending');
      const summary = summaries.get(record.threadId);
      if (!summary) throw new BackupValidationError(`post ${record.data.id} references a missing thread`);
      lastPostId = record.data.id;
      postCount++;
      summary.postCount++;
      if (!record.data.hidden) summary.visiblePostCount++;
      if (summary.postCount === 1 || record.data.createdAt < summary.firstPostAt)
        summary.firstPostAt = record.data.createdAt;
      if (record.data.createdAt > summary.latestPostAt) summary.latestPostAt = record.data.createdAt;
      hash.update(lineBytes);
      hash.update('\n');
      await options.onDataRecord?.(record, text);
      continue;
    }

    if (phase === 'trailer') throw new BackupValidationError('multiple trailer records');
    phase = 'trailer';
    trailer = record;
  }

  if (!manifest) throw new BackupValidationError('manifest is missing');
  if (!trailer) throw new BackupValidationError('trailer is missing');
  if (threadCount !== manifest.threadCount) throw new BackupValidationError('thread count does not match manifest');
  if (postCount !== manifest.postCount) throw new BackupValidationError('post count does not match manifest');
  if (lastThreadId > manifest.threadIdHighWaterMark)
    throw new BackupValidationError('thread ID exceeds high-water mark');
  if (lastPostId > manifest.postIdHighWaterMark) throw new BackupValidationError('post ID exceeds high-water mark');
  const actualDigest = Buffer.from(hash.digest('hex'), 'ascii');
  const expectedDigest = Buffer.from(trailer.sha256, 'ascii');
  if (!timingSafeEqual(actualDigest, expectedDigest)) throw new BackupValidationError('backup checksum mismatch');

  return { manifest, trailer, warnings: collectWarnings(summaries) };
}

export const verifyBunBackup = scanBunBackup;

async function* gzipLines(path: string): AsyncGenerator<Buffer> {
  const input = createReadStream(path);
  const gunzip = createGunzip();
  input.on('error', (error) => gunzip.destroy(error));
  input.pipe(gunzip);
  let pending = Buffer.alloc(0);
  try {
    for await (const chunk of gunzip) {
      pending = Buffer.concat([pending, chunk as Buffer]);
      let newline: number;
      while ((newline = pending.indexOf(0x0a)) !== -1) {
        const line = pending.subarray(0, newline);
        if (line.byteLength > BACKUP_MAX_RECORD_BYTES) throw new BackupValidationError('backup record exceeds 1 MiB');
        yield line;
        pending = pending.subarray(newline + 1);
      }
      if (pending.byteLength > BACKUP_MAX_RECORD_BYTES) throw new BackupValidationError('backup record exceeds 1 MiB');
    }
  } finally {
    input.destroy();
    gunzip.destroy();
  }
  if (pending.byteLength !== 0) throw new BackupValidationError('backup must end with LF');
}

function decodeLine(line: Buffer): string {
  if (line.byteLength === 0) throw new BackupValidationError('empty backup record');
  if (line[0] === 0xef && line[1] === 0xbb && line[2] === 0xbf)
    throw new BackupValidationError('UTF-8 BOM is not allowed');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(line);
  } catch {
    throw new BackupValidationError('backup contains invalid UTF-8');
  }
}

function collectWarnings(summaries: Map<number, ThreadSummary>): BackupSemanticWarningSummary[] {
  const warningIds: Record<BackupSemanticWarningType, number[]> = {
    amount: [],
    firstPostAt: [],
    latestPostAt: [],
  };
  const counts: Record<BackupSemanticWarningType, number> = { amount: 0, firstPostAt: 0, latestPostAt: 0 };
  for (const [id, summary] of summaries) {
    for (const type of Object.keys(warningIds) as BackupSemanticWarningType[]) {
      const actual = type === 'amount' ? summary.visiblePostCount : summary[type];
      if (summary.thread[type] !== actual) {
        counts[type]++;
        if (warningIds[type].length < 100) warningIds[type].push(id);
      }
    }
  }
  return (Object.keys(warningIds) as BackupSemanticWarningType[])
    .filter((type) => counts[type] > 0)
    .map((type) => ({ type, count: counts[type], threadIds: warningIds[type] }));
}
