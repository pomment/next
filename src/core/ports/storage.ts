import type { Post } from '../domain/post';
import type { Thread } from '../domain/thread';

export interface StoragePort {
  transaction<T>(fn: (storage: StoragePort) => Promise<T>): Promise<T>;

  getThreadById(id: string): Promise<Thread | null>;
  getThreadByUrl(url: string): Promise<Thread | null>;
  createThread(thread: Thread): Promise<void>;
  updateThread(thread: Thread): Promise<void>;
  listThreads(): Promise<Thread[]>;

  listPosts(threadId: string): Promise<Post[]>;
  getPost(threadId: string, postId: string): Promise<Post | null>;
  appendPost(threadId: string, post: Post): Promise<void>;
  updatePost(threadId: string, post: Post): Promise<void>;
}
