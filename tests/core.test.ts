import { describe, expect, test } from 'bun:test';
import { PommentCore, type Post, type StoragePort, type Thread } from '../src/core';

class MemoryStorage implements StoragePort {
  private threads = new Map<string, Thread>();
  private urlToThreadId = new Map<string, string>();
  private posts = new Map<string, Post[]>();

  async transaction<T>(fn: (storage: StoragePort) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async getThreadById(id: string): Promise<Thread | null> {
    return this.threads.get(id) ?? null;
  }

  async getThreadByUrl(url: string): Promise<Thread | null> {
    const id = this.urlToThreadId.get(url);
    return id ? this.threads.get(id) ?? null : null;
  }

  async createThread(thread: Thread): Promise<void> {
    this.threads.set(thread.id, thread);
    this.urlToThreadId.set(thread.url, thread.id);
    this.posts.set(thread.id, []);
  }

  async updateThread(thread: Thread): Promise<void> {
    this.threads.set(thread.id, thread);
    this.urlToThreadId.set(thread.url, thread.id);
  }

  async listThreads(): Promise<Thread[]> {
    return Array.from(this.threads.values());
  }

  async listPosts(threadId: string): Promise<Post[]> {
    return this.posts.get(threadId) ?? [];
  }

  async getPost(threadId: string, postId: string): Promise<Post | null> {
    return (this.posts.get(threadId) ?? []).find(post => post.id === postId) ?? null;
  }

  async appendPost(threadId: string, post: Post): Promise<void> {
    this.posts.set(threadId, [...(this.posts.get(threadId) ?? []), post]);
  }

  async updatePost(threadId: string, post: Post): Promise<void> {
    this.posts.set(
      threadId,
      (this.posts.get(threadId) ?? []).map(item => (item.id === post.id ? post : item)),
    );
  }
}

describe('PommentCore', () => {
  test('creates a thread and public comment for a new URL', async () => {
    const core = new PommentCore({ storage: new MemoryStorage() });

    const post = await core.createUserPost({
      url: 'https://example.com/post',
      title: 'Example Post',
      name: 'Alice',
      email: 'alice@example.com',
      website: 'javascript:alert(1)',
      content: 'hello',
      receiveEmail: true,
    });

    expect(post.website).toBe('');
    expect(post.emailHashed).toBe('c160f8cc69a4f0bf2b0362752353d060');
    expect(post.origContent).toBe('hello');

    const result = await core.listPublicPostsByUrl('https://example.com/post');
    expect(result.meta.amount).toBe(1);
    expect(result.post).toHaveLength(1);
    expect('email' in result.post[0]).toBe(false);
    expect('editKey' in result.post[0]).toBe(false);
    expect('receiveEmail' in result.post[0]).toBe(false);
    expect('origContent' in result.post[0]).toBe(false);
  });

  test('keeps initially hidden comments out of public lists and amount', async () => {
    const storage = new MemoryStorage();
    const core = new PommentCore({
      storage,
      config: { moderationInitiallyHidden: true },
    });

    const post = await core.createUserPost({
      url: 'https://example.com/hidden',
      title: 'Hidden Post',
      name: 'Alice',
      email: 'alice@example.com',
      content: 'pending',
    });

    const hiddenResult = await core.listPublicPostsByUrl('https://example.com/hidden');
    expect(hiddenResult.meta.amount).toBe(0);
    expect(hiddenResult.post).toHaveLength(0);

    const edited = await core.editPost({
      threadId: hiddenResult.meta.id,
      post: { ...post, hidden: false },
      alterEditTime: false,
    });
    expect(edited.hidden).toBe(false);

    const visibleResult = await core.listPublicPostsByUrl('https://example.com/hidden');
    expect(visibleResult.meta.amount).toBe(1);
    expect(visibleResult.post).toHaveLength(1);
  });
});
