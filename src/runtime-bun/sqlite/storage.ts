import { Database } from 'bun:sqlite';
import type { Post } from '../../core/domain/post';
import type { Thread } from '../../core/domain/thread';
import type { StoragePort } from '../../core/ports/storage';
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
    this.db.exec(schemaSql);
  }

  close(): void {
    this.db.close();
  }

  async transaction<T>(fn: (storage: StoragePort) => Promise<T>): Promise<T> {
    if (this.transactionDepth > 0) {
      return fn(this);
    }

    this.db.exec('BEGIN');
    this.transactionDepth++;
    try {
      const result = await fn(this);
      this.transactionDepth--;
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.transactionDepth--;
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async getThreadById(id: string): Promise<Thread | null> {
    const row = this.db
      .query<ThreadRow, [string]>('SELECT * FROM threads WHERE id = ?')
      .get(id);
    return row ? threadFromRow(row) : null;
  }

  async getThreadByUrl(url: string): Promise<Thread | null> {
    const row = this.db
      .query<ThreadRow, [string]>('SELECT * FROM threads WHERE url = ?')
      .get(url);
    return row ? threadFromRow(row) : null;
  }

  async createThread(thread: Thread): Promise<void> {
    this.db
      .query(`
        INSERT INTO threads (id, url, title, first_post_at, latest_post_at, amount, locked)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        thread.id,
        thread.url,
        thread.title,
        thread.firstPostAt,
        thread.latestPostAt,
        thread.amount,
        thread.locked ? 1 : 0,
      );
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

  async listPosts(threadId: string): Promise<Post[]> {
    return this.db
      .query<PostRow, [string]>('SELECT * FROM posts WHERE thread_id = ? ORDER BY created_at ASC, id ASC')
      .all(threadId)
      .map(postFromRow);
  }

  async getPost(threadId: string, postId: string): Promise<Post | null> {
    const row = this.db
      .query<PostRow, [string, string]>('SELECT * FROM posts WHERE thread_id = ? AND id = ?')
      .get(threadId, postId);
    return row ? postFromRow(row) : null;
  }

  async appendPost(threadId: string, post: Post): Promise<void> {
    this.db
      .query(`
        INSERT INTO posts (
          id, thread_id, name, email, email_hashed, website, parent, content,
          hidden, by_admin, receive_email, edit_key, created_at, updated_at,
          orig_content, avatar, rating
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
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

  async updatePost(threadId: string, post: Post): Promise<void> {
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
}
