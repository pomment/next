export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  first_post_at INTEGER NOT NULL DEFAULT 0,
  latest_post_at INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_hashed TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '',
  parent INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  by_admin INTEGER NOT NULL DEFAULT 0,
  receive_email INTEGER NOT NULL DEFAULT 0,
  edit_key TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  orig_content TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_posts_thread_created ON posts(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_thread_parent ON posts(thread_id, parent);

CREATE TABLE IF NOT EXISTS backup_imports (
  id TEXT PRIMARY KEY,
  backup_sha256 TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  status TEXT NOT NULL,
  next_sequence INTEGER NOT NULL DEFAULT 0,
  phase TEXT NOT NULL DEFAULT 'threads',
  last_thread_id INTEGER NOT NULL DEFAULT 0,
  last_post_id INTEGER NOT NULL DEFAULT 0,
  thread_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  max_records_per_batch INTEGER NOT NULL,
  max_bytes_per_batch INTEGER NOT NULL,
  max_record_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS backup_import_batches (
  import_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (import_id, sequence),
  FOREIGN KEY(import_id) REFERENCES backup_imports(id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS block_threads_insert_during_backup_import
BEFORE INSERT ON threads
WHEN EXISTS (SELECT 1 FROM backup_imports WHERE status = 'uploading')
BEGIN
  SELECT RAISE(ABORT, 'backup import is in progress');
END;

CREATE TRIGGER IF NOT EXISTS block_threads_update_during_backup_import
BEFORE UPDATE ON threads
WHEN EXISTS (SELECT 1 FROM backup_imports WHERE status = 'uploading')
BEGIN
  SELECT RAISE(ABORT, 'backup import is in progress');
END;

CREATE TRIGGER IF NOT EXISTS block_threads_delete_during_backup_import
BEFORE DELETE ON threads
WHEN EXISTS (SELECT 1 FROM backup_imports WHERE status = 'uploading')
BEGIN
  SELECT RAISE(ABORT, 'backup import is in progress');
END;

CREATE TRIGGER IF NOT EXISTS block_posts_insert_during_backup_import
BEFORE INSERT ON posts
WHEN EXISTS (SELECT 1 FROM backup_imports WHERE status = 'uploading')
BEGIN
  SELECT RAISE(ABORT, 'backup import is in progress');
END;

CREATE TRIGGER IF NOT EXISTS block_posts_update_during_backup_import
BEFORE UPDATE ON posts
WHEN EXISTS (SELECT 1 FROM backup_imports WHERE status = 'uploading')
BEGIN
  SELECT RAISE(ABORT, 'backup import is in progress');
END;

CREATE TRIGGER IF NOT EXISTS block_posts_delete_during_backup_import
BEFORE DELETE ON posts
WHEN EXISTS (SELECT 1 FROM backup_imports WHERE status = 'uploading')
BEGIN
  SELECT RAISE(ABORT, 'backup import is in progress');
END;

PRAGMA user_version = 1;
`;
