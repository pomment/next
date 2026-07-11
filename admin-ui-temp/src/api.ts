import type { AdminIdentity, Post, Thread } from './types';

interface ApiEnvelope<T> {
  code: number;
  data: T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || payload.code !== 200) {
    throw new Error(typeof payload.data === 'string' ? payload.data : `Request failed (${payload.code})`);
  }
  return payload.data;
}

export const api = {
  listThreads: () => request<Thread[]>('/admin/thread/list'),
  getThread: (id: number) => request<Thread>(`/admin/thread/meta/${id}`),
  listPosts: (threadId: number) => request<Post[]>(`/admin/thread/${threadId}`),
  updatePost: (threadId: number, post: Post) =>
    request<Post>(`/admin/posts/${threadId}`, { method: 'PUT', body: JSON.stringify(post) }),
  reply: (threadId: number, parent: number, content: string, identity: AdminIdentity) =>
    request<Post>(`/admin/posts/${threadId}`, {
      method: 'POST',
      body: JSON.stringify({ ...identity, parent, content }),
    }),
};
