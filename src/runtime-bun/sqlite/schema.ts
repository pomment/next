export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
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
`;
