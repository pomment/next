import type { Post } from '../domain/post';
import type { Thread } from '../domain/thread';

export interface StoragePort {
  transaction<T>(fn: (storage: StoragePort) => Promise<T>): Promise<T>;

  getThreadById(id: number): Promise<Thread | null>;
  getThreadByUrl(url: string): Promise<Thread | null>;
  createThread(thread: Thread): Promise<number>;
  updateThread(thread: Thread): Promise<void>;
  listThreads(): Promise<Thread[]>;

  listPosts(threadId: number): Promise<Post[]>;
  getPost(threadId: number, postId: number): Promise<Post | null>;
  appendPost(threadId: number, post: Post): Promise<number>;
  updatePost(threadId: number, post: Post): Promise<void>;
  deletePostsByThread(threadId: number): Promise<void>;
}
