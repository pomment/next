import type { Post } from '../domain/post';
import type { Thread } from '../domain/thread';

export const BACKUP_FORMAT_VERSION = 1 as const;
export const BACKUP_SOURCE_SCHEMA_VERSION = 1 as const;
export const BACKUP_MAX_RECORD_BYTES = 1024 * 1024;

export interface BackupManifestV1 {
  type: 'manifest';
  formatVersion: 1;
  sourceSchemaVersion: 1;
  generatorVersion: string;
  exportedAt: number;
  threadCount: number;
  postCount: number;
  threadIdHighWaterMark: number;
  postIdHighWaterMark: number;
}

export interface BackupThreadRecordV1 {
  type: 'thread';
  data: Thread;
}

export interface BackupPostRecordV1 {
  type: 'post';
  threadId: number;
  data: Post;
}

export interface BackupTrailerV1 {
  type: 'trailer';
  sha256: string;
}

export type BackupRecordV1 = BackupManifestV1 | BackupThreadRecordV1 | BackupPostRecordV1 | BackupTrailerV1;

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

const manifestKeys = [
  'type',
  'formatVersion',
  'sourceSchemaVersion',
  'generatorVersion',
  'exportedAt',
  'threadCount',
  'postCount',
  'threadIdHighWaterMark',
  'postIdHighWaterMark',
] as const;
const threadRecordKeys = ['type', 'data'] as const;
const threadKeys = ['title', 'firstPostAt', 'latestPostAt', 'amount', 'id', 'locked', 'slug', 'url'] as const;
const postRecordKeys = ['type', 'threadId', 'data'] as const;
const postKeys = [
  'id',
  'name',
  'email',
  'emailHashed',
  'website',
  'parent',
  'content',
  'hidden',
  'byAdmin',
  'receiveEmail',
  'editKey',
  'createdAt',
  'updatedAt',
  'origContent',
  'avatar',
  'rating',
] as const;
const trailerKeys = ['type', 'sha256'] as const;

function objectWithExactKeys(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BackupValidationError(`${name} must be an object`);
  }
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new BackupValidationError(`${name} fields are invalid`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') throw new BackupValidationError(`${name} must be a string`);
}

function booleanValue(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new BackupValidationError(`${name} must be a boolean`);
}

function safeInteger(value: unknown, name: string, minimum: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new BackupValidationError(`${name} must be a safe integer >= ${minimum}`);
  }
}

function finiteNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BackupValidationError(`${name} must be finite`);
  }
}

export function validateBackupManifestV1(value: unknown): BackupManifestV1 {
  const record = objectWithExactKeys(value, manifestKeys, 'manifest');
  if (record.type !== 'manifest') throw new BackupValidationError('manifest.type must be manifest');
  if (record.formatVersion !== BACKUP_FORMAT_VERSION) throw new BackupValidationError('unsupported formatVersion');
  if (record.sourceSchemaVersion !== BACKUP_SOURCE_SCHEMA_VERSION) {
    throw new BackupValidationError('unsupported sourceSchemaVersion');
  }
  stringValue(record.generatorVersion, 'manifest.generatorVersion');
  safeInteger(record.exportedAt, 'manifest.exportedAt', 0);
  safeInteger(record.threadCount, 'manifest.threadCount', 0);
  safeInteger(record.postCount, 'manifest.postCount', 0);
  safeInteger(record.threadIdHighWaterMark, 'manifest.threadIdHighWaterMark', 0);
  safeInteger(record.postIdHighWaterMark, 'manifest.postIdHighWaterMark', 0);
  return record as unknown as BackupManifestV1;
}

function validateThread(value: unknown): Thread {
  const thread = objectWithExactKeys(value, threadKeys, 'thread.data');
  stringValue(thread.title, 'thread.data.title');
  safeInteger(thread.firstPostAt, 'thread.data.firstPostAt', 0);
  safeInteger(thread.latestPostAt, 'thread.data.latestPostAt', 0);
  safeInteger(thread.amount, 'thread.data.amount', 0);
  safeInteger(thread.id, 'thread.data.id', 1);
  booleanValue(thread.locked, 'thread.data.locked');
  stringValue(thread.slug, 'thread.data.slug');
  stringValue(thread.url, 'thread.data.url');
  return thread as unknown as Thread;
}

export function validateBackupThreadRecordV1(value: unknown): BackupThreadRecordV1 {
  const record = objectWithExactKeys(value, threadRecordKeys, 'thread record');
  if (record.type !== 'thread') throw new BackupValidationError('thread record type must be thread');
  return { type: 'thread', data: validateThread(record.data) };
}

function validatePost(value: unknown): Post {
  const post = objectWithExactKeys(value, postKeys, 'post.data');
  safeInteger(post.id, 'post.data.id', 1);
  stringValue(post.name, 'post.data.name');
  stringValue(post.email, 'post.data.email');
  stringValue(post.emailHashed, 'post.data.emailHashed');
  stringValue(post.website, 'post.data.website');
  safeInteger(post.parent, 'post.data.parent', 0);
  stringValue(post.content, 'post.data.content');
  booleanValue(post.hidden, 'post.data.hidden');
  booleanValue(post.byAdmin, 'post.data.byAdmin');
  booleanValue(post.receiveEmail, 'post.data.receiveEmail');
  stringValue(post.editKey, 'post.data.editKey');
  safeInteger(post.createdAt, 'post.data.createdAt', 0);
  safeInteger(post.updatedAt, 'post.data.updatedAt', 0);
  stringValue(post.origContent, 'post.data.origContent');
  stringValue(post.avatar, 'post.data.avatar');
  finiteNumber(post.rating, 'post.data.rating');
  return post as unknown as Post;
}

export function validateBackupPostRecordV1(value: unknown): BackupPostRecordV1 {
  const record = objectWithExactKeys(value, postRecordKeys, 'post record');
  if (record.type !== 'post') throw new BackupValidationError('post record type must be post');
  safeInteger(record.threadId, 'post.threadId', 1);
  return { type: 'post', threadId: record.threadId, data: validatePost(record.data) };
}

export function validateBackupTrailerV1(value: unknown): BackupTrailerV1 {
  const record = objectWithExactKeys(value, trailerKeys, 'trailer');
  if (record.type !== 'trailer') throw new BackupValidationError('trailer.type must be trailer');
  stringValue(record.sha256, 'trailer.sha256');
  if (!/^[0-9a-f]{64}$/.test(record.sha256)) throw new BackupValidationError('trailer.sha256 is invalid');
  return record as unknown as BackupTrailerV1;
}

export function parseBackupRecordV1(text: string): BackupRecordV1 {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupValidationError('record is not valid JSON');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BackupValidationError('record must be an object');
  }
  let record: BackupRecordV1;
  switch ((value as { type?: unknown }).type) {
    case 'manifest':
      record = validateBackupManifestV1(value);
      break;
    case 'thread':
      record = validateBackupThreadRecordV1(value);
      break;
    case 'post':
      record = validateBackupPostRecordV1(value);
      break;
    case 'trailer':
      record = validateBackupTrailerV1(value);
      break;
    default:
      throw new BackupValidationError('record type is invalid');
  }
  if (serializeBackupRecordV1(record) !== text) throw new BackupValidationError('record is not canonical JSON');
  return record;
}

export function serializeBackupManifestV1(record: BackupManifestV1): string {
  validateBackupManifestV1(record);
  return JSON.stringify({
    type: record.type,
    formatVersion: record.formatVersion,
    sourceSchemaVersion: record.sourceSchemaVersion,
    generatorVersion: record.generatorVersion,
    exportedAt: record.exportedAt,
    threadCount: record.threadCount,
    postCount: record.postCount,
    threadIdHighWaterMark: record.threadIdHighWaterMark,
    postIdHighWaterMark: record.postIdHighWaterMark,
  });
}

export function serializeBackupThreadRecordV1(record: BackupThreadRecordV1): string {
  const valid = validateBackupThreadRecordV1(record);
  const data = valid.data;
  return JSON.stringify({
    type: 'thread',
    data: {
      title: data.title,
      firstPostAt: data.firstPostAt,
      latestPostAt: data.latestPostAt,
      amount: data.amount,
      id: data.id,
      locked: data.locked,
      slug: data.slug,
      url: data.url,
    },
  });
}

export function serializeBackupPostRecordV1(record: BackupPostRecordV1): string {
  const valid = validateBackupPostRecordV1(record);
  const data = valid.data;
  return JSON.stringify({
    type: 'post',
    threadId: valid.threadId,
    data: {
      id: data.id,
      name: data.name,
      email: data.email,
      emailHashed: data.emailHashed,
      website: data.website,
      parent: data.parent,
      content: data.content,
      hidden: data.hidden,
      byAdmin: data.byAdmin,
      receiveEmail: data.receiveEmail,
      editKey: data.editKey,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      origContent: data.origContent,
      avatar: data.avatar,
      rating: data.rating,
    },
  });
}

export function serializeBackupTrailerV1(record: BackupTrailerV1): string {
  validateBackupTrailerV1(record);
  return JSON.stringify({ type: record.type, sha256: record.sha256 });
}

export function serializeBackupRecordV1(record: BackupRecordV1): string {
  switch (record.type) {
    case 'manifest':
      return serializeBackupManifestV1(record);
    case 'thread':
      return serializeBackupThreadRecordV1(record);
    case 'post':
      return serializeBackupPostRecordV1(record);
    case 'trailer':
      return serializeBackupTrailerV1(record);
  }
}
