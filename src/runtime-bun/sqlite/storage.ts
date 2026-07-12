import { Database } from 'bun:sqlite';
import type { Post } from '../../core/domain/post';
import type { Thread } from '../../core/domain/thread';
import type { StoragePort } from '../../core/ports/storage';
import { ServiceUnavailableError } from '../../core/errors';
import { schemaSql } from './schema';
import { postFromRow, threadFromRow, type PostRow, type ThreadRow } from './rows';

export interface BunSqliteStorageOptions {
  filename: string;
}

export class BunSqliteStorage implements StoragePort {
  private readonly db: Database;
  private transactionDepth = 0;

  constructor(options: BunSqliteStorageOptions) {
    this.db = new Database(options.filename, { create: true });
    const schemaVersion = this.db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;
    if (schemaVersion > 1) {
      this.db.close();
      throw new Error(`unsupported SQLite schema version: ${schemaVersion}`);
    }
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(schemaSql);
  }

  close(): void {
    this.db.close();
  }

  async transaction<T>(fn: (storage: StoragePort) => Promise<T>): Promise<T> {
    if (this.transactionDepth > 0) {
      return fn(this);
    }

    this.db.exec('BEGIN IMMEDIATE');
    this.transactionDepth++;
    try {
      const result = await fn(this);
      this.transactionDepth--;
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.transactionDepth--;
      this.db.exec('ROLLBACK');
      if (error instanceof Error && error.message.includes('backup import is in progress')) {
        throw new ServiceUnavailableError('backup import is in progress');
      }
      throw error;
    }
  }

  async getThreadById(id: number): Promise<Thread | null> {
    const row = this.db
      .query<ThreadRow, [number]>('SELECT * FROM threads WHERE id = ?')
      .get(id);
    return row ? threadFromRow(row) : null;
  }

  async getThreadByUrl(url: string): Promise<Thread | null> {
    const row = this.db
      .query<ThreadRow, [string]>('SELECT * FROM threads WHERE url = ?')
      .get(url);
    return row ? threadFromRow(row) : null;
  }

  async createThread(thread: Thread): Promise<number> {
    this.db
      .query(`
        INSERT INTO threads (url, title, first_post_at, latest_post_at, amount, locked)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        thread.url,
        thread.title,
        thread.firstPostAt,
        thread.latestPostAt,
        thread.amount,
        thread.locked ? 1 : 0,
      );
    return (this.db.query('SELECT last_insert_rowid() AS id').get() as { id: number }).id;
  }

  async updateThread(thread: Thread): Promise<void> {
    this.db
      .query(`
        UPDATE threads
        SET url = ?, title = ?, first_post_at = ?, latest_post_at = ?, amount = ?, locked = ?
        WHERE id = ?
      `)
      .run(
        thread.url,
        thread.title,
        thread.firstPostAt,
        thread.latestPostAt,
        thread.amount,
        thread.locked ? 1 : 0,
        thread.id,
      );
  }

  async listThreads(): Promise<Thread[]> {
    return this.db
      .query<ThreadRow, []>('SELECT * FROM threads ORDER BY latest_post_at DESC, id ASC')
      .all()
      .map(threadFromRow);
  }

  async listPosts(threadId: number): Promise<Post[]> {
    return this.db
      .query<PostRow, [number]>('SELECT * FROM posts WHERE thread_id = ? ORDER BY created_at ASC, id ASC')
      .all(threadId)
      .map(postFromRow);
  }

  async getPost(threadId: number, postId: number): Promise<Post | null> {
    const row = this.db
      .query<PostRow, [number, number]>('SELECT * FROM posts WHERE thread_id = ? AND id = ?')
      .get(threadId, postId);
    return row ? postFromRow(row) : null;
  }

  async appendPost(threadId: number, post: Post): Promise<number> {
    this.db
      .query(`
        INSERT INTO posts (
          thread_id, name, email, email_hashed, website, parent, content,
          hidden, by_admin, receive_email, edit_key, created_at, updated_at,
          orig_content, avatar, rating
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
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
    return (this.db.query('SELECT last_insert_rowid() AS id').get() as { id: number }).id;
  }

  async updatePost(threadId: number, post: Post): Promise<void> {
    this.db
      .query(`
        UPDATE posts
        SET name = ?, email = ?, email_hashed = ?, website = ?, parent = ?, content = ?,
            hidden = ?, by_admin = ?, receive_email = ?, edit_key = ?, created_at = ?,
            updated_at = ?, orig_content = ?, avatar = ?, rating = ?
        WHERE thread_id = ? AND id = ?
      `)
      .run(
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
        threadId,
        post.id,
      );
  }

  async deletePostsByThread(threadId: number): Promise<void> {
    this.db.query('DELETE FROM posts WHERE thread_id = ?').run(threadId);
  }
}
