import { describe, expect, test } from 'bun:test';
import {
  PommentCore,
  type CaptchaPort,
  type EditPostInput,
  type Post,
  type StoragePort,
  type Thread,
  type UpdateThreadInput,
} from '../src/core';

class FakeCaptchaPort implements CaptchaPort {
  async verify(response: string): Promise<{ passed: boolean; score?: number }> {
    return { passed: response === 'valid', score: response === 'valid' ? 0.9 : 0.1 };
  }
}

class MemoryStorage implements StoragePort {
  private threads = new Map<number, Thread>();
  private slugToThreadId = new Map<string, number>();
  private posts = new Map<number, Post[]>();
  private nextThreadId = 1;
  private nextPostId = 1;

  async transaction<T>(fn: (storage: StoragePort) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async getThreadById(id: number): Promise<Thread | null> {
    return this.threads.get(id) ?? null;
  }

  async getThreadBySlug(slug: string): Promise<Thread | null> {
    const id = this.slugToThreadId.get(slug);
    return id ? (this.threads.get(id) ?? null) : null;
  }

  async createThread(thread: Thread): Promise<number> {
    const id = this.nextThreadId++;
    this.threads.set(id, { ...thread, id });
    this.slugToThreadId.set(thread.slug, id);
    this.posts.set(id, []);
    return id;
  }

  async updateThread(thread: Thread): Promise<void> {
    this.threads.set(thread.id, thread);
    this.slugToThreadId.set(thread.slug, thread.id);
  }

  async listThreads(): Promise<Thread[]> {
    return Array.from(this.threads.values());
  }

  async listPosts(threadId: number): Promise<Post[]> {
    return this.posts.get(threadId) ?? [];
  }

  async getPost(threadId: number, postId: number): Promise<Post | null> {
    return (this.posts.get(threadId) ?? []).find((post) => post.id === postId) ?? null;
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
      (this.posts.get(threadId) ?? []).map((item) => (item.id === post.id ? post : item)),
    );
  }

  async deletePostsByThread(threadId: number): Promise<void> {
    this.posts.set(threadId, []);
  }
}

describe('PommentCore', () => {
  test('creates a thread and public comment for a new slug', async () => {
    const core = new PommentCore({ storage: new MemoryStorage() });

    const post = await core.createUserPost({
      slug: 'post',
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
    expect(post.id).toBeGreaterThan(0);

    const result = await core.listPublicPostsBySlug('post');
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
      slug: 'hidden',
      url: 'https://example.com/hidden',
      title: 'Hidden Post',
      name: 'Alice',
      email: 'alice@example.com',
      content: 'pending',
    });

    const hiddenResult = await core.listPublicPostsBySlug('hidden');
    expect(hiddenResult.meta.amount).toBe(0);
    expect(hiddenResult.post).toHaveLength(0);

    const edited = await core.editPost({
      threadId: hiddenResult.meta.id,
      id: post.id,
      name: post.name,
      email: post.email,
      website: post.website,
      content: post.content,
      hidden: false,
      receiveEmail: post.receiveEmail,
      byAdmin: post.byAdmin,
      alterEditTime: false,
    });
    expect(edited.hidden).toBe(false);

    const visibleResult = await core.listPublicPostsBySlug('hidden');
    expect(visibleResult.meta.amount).toBe(1);
    expect(visibleResult.post).toHaveLength(1);
  });

  test('updates only public thread metadata fields', async () => {
    const storage = new MemoryStorage();
    const core = new PommentCore({ storage });
    await core.createUserPost({
      slug: 'original',
      url: 'https://example.com/original',
      title: 'Original',
      name: 'Alice',
      email: 'alice@example.com',
      content: 'hello',
    });
    const original = await core.getThreadMetaBySlug('original');
    const input: UpdateThreadInput & Partial<Thread> = {
      id: original.id,
      title: 'Updated',
      slug: 'updated',
      url: 'https://example.com/updated',
      locked: true,
      amount: 999,
      firstPostAt: 1,
      latestPostAt: 2,
    };

    const updated = await core.updateThreadMeta(input);

    expect(updated).toEqual({
      ...original,
      title: 'Updated',
      slug: 'updated',
      url: 'https://example.com/updated',
      locked: true,
    });
    expect(core.updateThreadMeta({ ...input, id: 999 })).rejects.toThrow('thread not found');
    expect(core.updateThreadMeta({ ...input, url: 'javascript:alert(1)' })).rejects.toThrow(
      'thread URL must be a valid http or https URL',
    );
    expect(core.updateThreadMeta({ ...input, url: 'https://' })).rejects.toThrow(
      'thread URL must be a valid http or https URL',
    );
    expect(
      core.createUserPost({
        slug: updated.slug,
        url: updated.url,
        title: updated.title,
        name: 'Blocked',
        email: 'blocked@example.com',
        content: 'blocked',
      }),
    ).rejects.toThrow('thread is locked');

    await core.createUserPost({
      slug: 'conflict',
      url: 'https://example.com/conflict',
      title: 'Conflict',
      name: 'Alice',
      email: 'alice@example.com',
      content: 'hello',
    });
    expect(core.updateThreadMeta({ ...input, slug: 'conflict' })).rejects.toThrow('thread slug already exists');
    expect(core.updateThreadMeta({ ...input, locked: undefined as unknown as boolean })).rejects.toThrow(
      'invalid thread fields',
    );
  });

  test('admin post edits protect internal fields and derive mutable values', async () => {
    const storage = new MemoryStorage();
    const core = new PommentCore({ storage, config: { avatarHash: 'sha256' } });
    const original = await core.createUserPost({
      slug: 'edit',
      url: 'https://example.com/edit',
      title: 'Edit',
      name: 'Alice',
      email: 'alice@example.com',
      website: 'https://alice.example',
      content: 'original',
    });
    const thread = await core.getThreadMetaBySlug('edit');
    const input: EditPostInput & Partial<Post> = {
      threadId: thread.id,
      id: original.id,
      name: 'Admin edit',
      email: 'new@example.com',
      website: 'javascript:alert(1)',
      content: 'edited',
      hidden: true,
      receiveEmail: true,
      byAdmin: true,
      alterEditTime: false,
      parent: 999,
      editKey: 'overwritten',
      createdAt: 1,
      updatedAt: 2,
      origContent: 'overwritten',
      avatar: 'overwritten',
      rating: 999,
      emailHashed: 'overwritten',
    };

    const edited = await core.editPost(input);

    expect(edited).toEqual({
      ...original,
      name: 'Admin edit',
      email: 'new@example.com',
      emailHashed: 'f0030501023327437b06e5c6f87df7871b8e704ae608d1d0b7b24fdd2a06c716',
      website: '',
      content: 'edited',
      hidden: true,
      receiveEmail: true,
      byAdmin: true,
    });
    expect((await core.getThreadMetaById(thread.id)).amount).toBe(0);
    expect(core.editPost({ ...input, hidden: undefined as unknown as boolean })).rejects.toThrow(
      'invalid admin comment fields',
    );
  });

  test('captcha-enabled post starts hidden and becomes visible after async verification', async () => {
    const storage = new MemoryStorage();
    const captcha = new FakeCaptchaPort();
    const core = new PommentCore({
      storage,
      captcha,
      config: { captcha: { enabled: true, minimumScore: 0.5 } },
    });

    const post = await core.createUserPost({
      slug: 'captcha-post',
      url: 'https://example.com/captcha',
      title: 'Captcha Post',
      name: 'Bob',
      email: 'bob@example.com',
      content: 'hello captcha',
      challengeResponse: 'valid',
    });

    const thread = await core.getThreadMetaBySlug('captcha-post');

    expect(post.hidden).toBe(true);
    expect(post.rating).toBe(0);

    await waitFor(() => storage.listPosts(thread.id).then((posts) => posts.some((p) => !p.hidden)));

    const stored = await storage.getPost(thread.id, post.id);
    expect(stored?.hidden).toBe(false);
    expect(stored?.rating).toBe(0.9);
  });

  test('captcha-enabled post with failed verification still becomes visible', async () => {
    const storage = new MemoryStorage();
    const captcha = new FakeCaptchaPort();
    const core = new PommentCore({
      storage,
      captcha,
      config: { captcha: { enabled: true, minimumScore: 0.5 } },
    });

    const post = await core.createUserPost({
      slug: 'captcha-fail',
      url: 'https://example.com/fail',
      title: 'Fail Post',
      name: 'Carol',
      email: 'carol@example.com',
      content: 'bad captcha',
      challengeResponse: 'invalid',
    });

    const thread = await core.getThreadMetaBySlug('captcha-fail');

    expect(post.hidden).toBe(true);

    await waitFor(() => storage.listPosts(thread.id).then((posts) => posts.some((p) => !p.hidden)));

    const stored = await storage.getPost(thread.id, post.id);
    expect(stored?.hidden).toBe(false);
    expect(stored?.rating).toBe(0.1);
  });

  test('captcha-disabled post is not hidden regardless of captcha port', async () => {
    const storage = new MemoryStorage();
    const captcha = new FakeCaptchaPort();
    const core = new PommentCore({
      storage,
      captcha,
      config: { captcha: { enabled: false, minimumScore: 0.5 } },
    });

    const post = await core.createUserPost({
      slug: 'no-captcha',
      url: 'https://example.com/nocaptcha',
      title: 'No Captcha',
      name: 'Dave',
      email: 'dave@example.com',
      content: 'no captcha needed',
      challengeResponse: 'whatever',
    });

    expect(post.hidden).toBe(false);
  });
});

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('waitFor timed out');
}
