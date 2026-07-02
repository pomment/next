import { describe, expect, test } from 'bun:test';
import { PommentCore, type Post, type StoragePort, type Thread } from '../src/core';
import type { ImportThreadInput, LegacyPostInput } from '../src/core/domain/post';

class MemoryStorage implements StoragePort {
  private threads = new Map<number, Thread>();
  private urlToThreadId = new Map<string, number>();
  private posts = new Map<number, Post[]>();
  private nextThreadId = 1;
  private nextPostId = 1;

  async transaction<T>(fn: (storage: StoragePort) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async getThreadById(id: number): Promise<Thread | null> {
    return this.threads.get(id) ?? null;
  }

  async getThreadByUrl(url: string): Promise<Thread | null> {
    const id = this.urlToThreadId.get(url);
    return id ? this.threads.get(id) ?? null : null;
  }

  async createThread(thread: Thread): Promise<number> {
    const id = this.nextThreadId++;
    this.threads.set(id, { ...thread, id });
    this.urlToThreadId.set(thread.url, id);
    this.posts.set(id, []);
    return id;
  }

  async updateThread(thread: Thread): Promise<void> {
    this.threads.set(thread.id, thread);
    this.urlToThreadId.set(thread.url, thread.id);
  }

  async listThreads(): Promise<Thread[]> {
    return Array.from(this.threads.values());
  }

  async listPosts(threadId: number): Promise<Post[]> {
    return this.posts.get(threadId) ?? [];
  }

  async getPost(threadId: number, postId: number): Promise<Post | null> {
    return (this.posts.get(threadId) ?? []).find(post => post.id === postId) ?? null;
  }

  async appendPost(threadId: number, post: Post): Promise<number> {
    const id = this.nextPostId++;
    const stored = { ...post, id };
    this.posts.set(threadId, [...(this.posts.get(threadId) ?? []), stored]);
    return id;
  }

  async updatePost(threadId: number, post: Post): Promise<void> {
    this.posts.set(
      threadId,
      (this.posts.get(threadId) ?? []).map(item => (item.id === post.id ? post : item)),
    );
  }

  async deletePostsByThread(threadId: number): Promise<void> {
    this.posts.set(threadId, []);
  }
}

function makeThread(): Thread {
  return {
    id: 0,
    url: 'https://example.com/test-post/',
    title: 'Test Post',
    firstPostAt: 1609459200000,
    latestPostAt: 1609545600000,
    amount: 2,
    locked: false,
  };
}

function makePosts(): LegacyPostInput[] {
  return [
    {
      id: 'legacy-post-001',
      name: 'Alice',
      email: 'alice@example.com',
      emailHashed: 'c160f8cc69a4f0bf2b0362752353d060',
      website: 'https://alice.example.com',
      avatar: '',
      parent: '',
      content: 'First comment',
      origContent: 'First comment',
      hidden: false,
      rating: 0,
      byAdmin: false,
      receiveEmail: true,
      editKey: 'abc123',
      createdAt: 1609459200000,
      updatedAt: 1609459200000,
    },
    {
      id: 'legacy-post-002',
      name: 'Bob',
      email: 'bob@example.com',
      emailHashed: 'f5d1278e8109edd94e1e4197e04873b9',
      website: '',
      avatar: '',
      parent: 'legacy-post-001',
      content: 'Reply to Alice',
      origContent: 'Reply to Alice',
      hidden: false,
      rating: 0,
      byAdmin: false,
      receiveEmail: false,
      editKey: 'def456',
      createdAt: 1609545600000,
      updatedAt: 1609545600000,
    },
  ];
}

describe('importThread', () => {
  test('imports a thread with posts preserving all fields', async () => {
    const core = new PommentCore({ storage: new MemoryStorage() });

    const result = await core.importThread({
      thread: makeThread(),
      posts: makePosts(),
    });

    expect(result.postCount).toBe(2);
    expect(result.thread.id).toBeGreaterThan(0);

    const storedThread = await core.getThreadMetaById(result.thread.id);
    expect(storedThread.url).toBe('https://example.com/test-post/');
    expect(storedThread.title).toBe('Test Post');
    expect(storedThread.firstPostAt).toBe(1609459200000);
    expect(storedThread.latestPostAt).toBe(1609545600000);
    expect(storedThread.amount).toBe(2);
    expect(storedThread.locked).toBe(false);

    const posts = await core.listAllPostsById(result.thread.id);
    expect(posts).toHaveLength(2);

    const alice = posts.find(p => p.name === 'Alice')!;
    expect(alice.email).toBe('alice@example.com');
    expect(alice.emailHashed).toBe('c160f8cc69a4f0bf2b0362752353d060');
    expect(alice.website).toBe('https://alice.example.com');
    expect(alice.editKey).toBe('abc123');
    expect(alice.origContent).toBe('First comment');
    expect(alice.receiveEmail).toBe(true);
    expect(alice.createdAt).toBe(1609459200000);
    expect(alice.updatedAt).toBe(1609459200000);
    expect(alice.id).toBeGreaterThan(0);

    const bob = posts.find(p => p.name === 'Bob')!;
    expect(bob.parent).toBe(alice.id);
  });

  test('is idempotent: re-import overwrites posts', async () => {
    const core = new PommentCore({ storage: new MemoryStorage() });

    const first = await core.importThread({
      thread: makeThread(),
      posts: makePosts(),
    });

    const newPosts: LegacyPostInput[] = [
      {
        id: 'legacy-post-003',
        name: 'Charlie',
        email: 'charlie@example.com',
        emailHashed: 'ed8ce15386c87c3daa2f7b3f3695b232',
        content: 'New comment after re-import',
        createdAt: 1609632000000,
        updatedAt: 1609632000000,
      },
    ];

    const second = await core.importThread({
      thread: { ...makeThread(), id: first.thread.id },
      posts: newPosts,
    });

    expect(second.postCount).toBe(1);

    const posts = await core.listAllPostsById(first.thread.id);
    expect(posts).toHaveLength(1);
    expect(posts[0].name).toBe('Charlie');
  });

  test('handles 15-field variant without origContent', async () => {
    const core = new PommentCore({ storage: new MemoryStorage() });

    const postWithoutOrig: LegacyPostInput = {
      id: 'legacy-post-004',
      name: 'Legacy',
      email: 'legacy@example.com',
      emailHashed: 'd41d8cd98f00b204e9800998ecf8427e',
      content: 'Old comment without origContent',
      createdAt: 1609459200000,
      updatedAt: 1609459200000,
    };

    const result = await core.importThread({
      thread: makeThread(),
      posts: [postWithoutOrig],
    });

    const posts = await core.listAllPostsById(result.thread.id);
    expect(posts[0].origContent).toBe('Old comment without origContent');
    expect(posts[0].website).toBe('');
    expect(posts[0].parent).toBe(0);
    expect(posts[0].hidden).toBe(false);
    expect(posts[0].byAdmin).toBe(false);
    expect(posts[0].receiveEmail).toBe(false);
    expect(posts[0].editKey).toBe('');
    expect(posts[0].avatar).toBe('');
    expect(posts[0].rating).toBe(0);
  });

  test('preserves hidden posts and locked threads', async () => {
    const core = new PommentCore({ storage: new MemoryStorage() });

    const lockedThread: Thread = {
      ...makeThread(),
      locked: true,
      amount: 1,
    };

    const postsWithHidden: LegacyPostInput[] = [
      {
        ...makePosts()[0],
        hidden: false,
      },
      {
        ...makePosts()[1],
        hidden: true,
      },
    ];

    const result = await core.importThread({
      thread: lockedThread,
      posts: postsWithHidden,
    });

    const storedThread = await core.getThreadMetaById(result.thread.id);
    expect(storedThread.locked).toBe(true);
    expect(storedThread.amount).toBe(1);

    const publicPosts = await core.listPublicPostsById(result.thread.id);
    expect(publicPosts.post).toHaveLength(1);
  });

  test('validates required thread fields', async () => {
    const core = new PommentCore({ storage: new MemoryStorage() });

    await expect(
      core.importThread({
        thread: { id: 0, url: '', title: '', firstPostAt: 0, latestPostAt: 0, amount: 0, locked: false },
        posts: [],
      }),
    ).rejects.toThrow('missing required thread fields');
  });

  test('validates required post fields', async () => {
    const core = new PommentCore({ storage: new MemoryStorage() });

    await expect(
      core.importThread({
        thread: makeThread(),
        posts: [{ id: '', name: '', email: '', emailHashed: '', content: 'ok', createdAt: 0, updatedAt: 0 }],
      }),
    ).rejects.toThrow('missing required post fields');
  });
});
