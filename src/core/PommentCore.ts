import { defaultCoreConfig, type PommentCoreConfig } from './domain/config';
import type {
  CreateAdminPostInput,
  CreateUserPostInput,
  EditPostInput,
  ImportThreadInput,
  ImportThreadResult,
  LegacyPostInput,
  Post,
  PostListResult,
} from './domain/post';
import type { Thread } from './domain/thread';
import { NotFoundError, ValidationError } from './errors';
import { InlineJobPort, type JobPort } from './ports/jobs';
import type { StoragePort } from './ports/storage';
import { generateEditKey } from './support/edit-key';
import { hashEmail } from './support/email-hash';
import { toPublicPost } from './support/public-post';
import { sanitizeWebsite } from './support/website';

export interface PommentCoreDeps {
  storage: StoragePort;
  jobs?: JobPort;
  config?: Partial<PommentCoreConfig>;
}

export class PommentCore {
  private readonly jobs: JobPort;
  private readonly config: PommentCoreConfig;

  constructor(private readonly deps: PommentCoreDeps) {
    this.jobs = deps.jobs ?? new InlineJobPort();
    this.config = { ...defaultCoreConfig, ...deps.config };
  }

  async getThreadMetaById(id: number): Promise<Thread> {
    const thread = await this.deps.storage.getThreadById(id);
    return thread ?? this.emptyThread({ id });
  }

  async getThreadMetaByUrl(url: string): Promise<Thread> {
    const thread = await this.deps.storage.getThreadByUrl(url);
    return thread ?? this.emptyThread({ url });
  }

  async getThreadMetaByUrls(urls: string[]): Promise<Record<string, Thread>> {
    const out: Record<string, Thread> = {};
    for (const url of urls) {
      out[url] = await this.getThreadMetaByUrl(url);
    }
    return out;
  }

  async listPublicPostsById(threadId: number): Promise<PostListResult> {
    const thread = await this.deps.storage.getThreadById(threadId);
    if (!thread) {
      return {
        meta: this.emptyThread({ id: threadId }),
        post: [],
      };
    }

    const posts = await this.deps.storage.listPosts(threadId);
    return {
      meta: thread,
      post: posts.filter(post => !post.hidden).map(toPublicPost),
    };
  }

  async listPublicPostsByUrl(url: string): Promise<PostListResult> {
    const thread = await this.deps.storage.getThreadByUrl(url);
    if (!thread) {
      return {
        meta: this.emptyThread({ url }),
        post: [],
      };
    }

    return this.listPublicPostsById(thread.id);
  }

  async listAllPostsById(threadId: number): Promise<Post[]> {
    return this.deps.storage.listPosts(threadId);
  }

  async getPost(threadId: number, postId: number): Promise<Post> {
    const post = await this.deps.storage.getPost(threadId, postId);
    if (!post) {
      throw new NotFoundError('unable to find post');
    }
    return post;
  }

  async createUserPost(input: CreateUserPostInput): Promise<Post> {
    this.validateUserPostInput(input);

    let createdThread: Thread | null = null;
    const post = await this.deps.storage.transaction(async storage => {
      let thread = await storage.getThreadByUrl(input.url);
      if (!thread) {
        thread = {
          id: 0,
          url: input.url,
          title: input.title,
          firstPostAt: 0,
          latestPostAt: 0,
          amount: 0,
          locked: false,
        };
        thread.id = await storage.createThread(thread);
      }

      const now = Date.now();
      const post: Post = {
        id: 0,
        name: input.name,
        email: input.email,
        emailHashed: await hashEmail(input.email, this.config.avatarHash),
        website: sanitizeWebsite(input.website),
        parent: input.parent ?? 0,
        content: input.content,
        hidden: this.config.moderationInitiallyHidden,
        byAdmin: false,
        receiveEmail: input.receiveEmail ?? false,
        editKey: generateEditKey(),
        createdAt: now,
        updatedAt: now,
        origContent: input.content,
        avatar: '',
        rating: 0,
      };

      post.id = await storage.appendPost(thread.id, post);
      createdThread = await this.refreshThreadMetaWithStorage(storage, thread.id);
      return post;
    });

    await this.jobs.dispatch('post.created', { post, thread: createdThread, challengeResponse: input.challengeResponse });
    return post;
  }

  async createAdminPost(input: CreateAdminPostInput): Promise<Post> {
    this.validateAdminPostInput(input);

    return this.deps.storage.transaction(async storage => {
      const thread = await storage.getThreadById(input.threadId);
      if (!thread) {
        throw new NotFoundError('thread not found');
      }

      const now = Date.now();
      const post: Post = {
        id: 0,
        name: input.name,
        email: input.email,
        emailHashed: await hashEmail(input.email, this.config.avatarHash),
        website: '',
        parent: input.parent ?? 0,
        content: input.content,
        hidden: false,
        byAdmin: true,
        receiveEmail: false,
        editKey: '',
        createdAt: now,
        updatedAt: now,
        origContent: input.content,
        avatar: '',
        rating: 0,
      };

      post.id = await storage.appendPost(thread.id, post);
      await this.refreshThreadMetaWithStorage(storage, thread.id);
      return post;
    });
  }

  async editPost(input: EditPostInput): Promise<Post> {
    return this.deps.storage.transaction(async storage => {
      const existing = await storage.getPost(input.threadId, input.post.id);
      if (!existing) {
        throw new NotFoundError('unable to find post');
      }

      const updated: Post = {
        ...input.post,
        updatedAt: input.alterEditTime === false ? input.post.updatedAt : Date.now(),
      };

      await storage.updatePost(input.threadId, updated);
      await this.refreshThreadMetaWithStorage(storage, input.threadId);
      return updated;
    });
  }

  async refreshThreadMeta(threadId: number): Promise<Thread> {
    return this.deps.storage.transaction(storage => this.refreshThreadMetaWithStorage(storage, threadId));
  }

  async refreshAllThreadMeta(): Promise<void> {
    const threads = await this.deps.storage.listThreads();
    for (const thread of threads) {
      await this.refreshThreadMeta(thread.id);
    }
  }

  async listThreads(): Promise<Thread[]> {
    return this.deps.storage.listThreads();
  }

  async updateThreadMeta(thread: Thread): Promise<Thread> {
    await this.deps.storage.updateThread(thread);
    return thread;
  }

  private async refreshThreadMetaWithStorage(storage: StoragePort, threadId: number): Promise<Thread> {
    const thread = await storage.getThreadById(threadId);
    if (!thread) {
      throw new NotFoundError('thread not found');
    }

    const posts = await storage.listPosts(threadId);
    const visiblePosts = posts.filter(post => !post.hidden);
    const createdAtValues = posts.map(post => post.createdAt);
    const updated: Thread = {
      ...thread,
      amount: visiblePosts.length,
      firstPostAt: createdAtValues.length ? Math.min(...createdAtValues) : 0,
      latestPostAt: createdAtValues.length ? Math.max(...createdAtValues) : 0,
    };

    await storage.updateThread(updated);
    return updated;
  }

  async importThread(input: ImportThreadInput): Promise<ImportThreadResult> {
    this.validateImportInput(input);

    const { threadId, postCount } = await this.deps.storage.transaction(async storage => {
      const existing = await storage.getThreadByUrl(input.thread.url);
      let threadId: number;
      if (existing) {
        threadId = existing.id;
        await storage.updateThread({ ...input.thread, id: threadId });
        await storage.deletePostsByThread(threadId);
      } else {
        threadId = await storage.createThread({ ...input.thread, id: 0 });
      }

      for (const legacy of input.posts) {
        await storage.appendPost(threadId, this.legacyPostToPost(legacy));
      }

      await storage.updateThread({ ...input.thread, id: threadId });
      return { threadId, postCount: input.posts.length };
    });

    return { thread: { ...input.thread, id: threadId }, postCount };
  }

  private legacyPostToPost(input: LegacyPostInput): Post {
    return {
      id: 0,
      name: input.name,
      email: input.email,
      emailHashed: input.emailHashed,
      website: input.website ?? '',
      parent: input.parent ?? 0,
      content: input.content,
      hidden: input.hidden ?? false,
      byAdmin: input.byAdmin ?? false,
      receiveEmail: input.receiveEmail ?? false,
      editKey: input.editKey ?? '',
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      origContent: input.origContent ?? input.content,
      avatar: input.avatar ?? '',
      rating: input.rating ?? 0,
    };
  }

  private validateImportInput(input: ImportThreadInput): void {
    if (!input.thread.url || !input.thread.title) {
      throw new ValidationError('missing required thread fields');
    }
    if (!Array.isArray(input.posts)) {
      throw new ValidationError('posts must be an array');
    }
    for (const post of input.posts) {
      if (!post.emailHashed || !post.content) {
        throw new ValidationError('missing required post fields');
      }
    }
  }

  private emptyThread(seed: Partial<Pick<Thread, 'id' | 'url'>>): Thread {
    return {
      id: seed.id ?? 0,
      url: seed.url ?? '',
      title: '',
      firstPostAt: 0,
      latestPostAt: 0,
      amount: 0,
      locked: false,
    };
  }

  private validateUserPostInput(input: CreateUserPostInput): void {
    if (!input.url || !input.title || !input.name || !input.email || !input.content) {
      throw new ValidationError('missing required comment fields');
    }
  }

  private validateAdminPostInput(input: CreateAdminPostInput): void {
    if (!input.threadId || !input.name || !input.email || !input.content) {
      throw new ValidationError('missing required admin comment fields');
    }
  }
}
