import type { BackupManifestV1 } from '../backup/v1';

export interface BackupImportSession {
  id: string;
  backupSha256: string;
  nextSequence: number;
  status: 'uploading' | 'complete';
  expiresAt: number;
}

export interface StartBackupImportInput {
  manifest: BackupManifestV1;
  sha256: string;
}

export interface StartBackupImportResult extends BackupImportSession {
  maxRecordsPerBatch: number;
  maxBytesPerBatch: number;
  maxRecordBytes: number;
}

export interface AppendBackupBatchResult {
  nextSequence: number;
  threadCount: number;
  postCount: number;
}

export interface BackupImportWarning {
  type: 'amount' | 'firstPostAt' | 'latestPostAt';
  count: number;
  threadIds: number[];
}

export interface CompleteBackupImportResult {
  threadCount: number;
  postCount: number;
  warnings: BackupImportWarning[];
}

export interface BackupImportPort {
  getActiveSession(): Promise<BackupImportSession | null>;
  isImporting(): Promise<boolean>;
  start(input: StartBackupImportInput): Promise<StartBackupImportResult>;
  appendBatch(id: string, sequence: number, sha256: string, bytes: Uint8Array): Promise<AppendBackupBatchResult>;
  complete(id: string): Promise<CompleteBackupImportResult>;
  abort(id: string): Promise<void>;
}
