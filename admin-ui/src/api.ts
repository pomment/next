import type { AdminIdentity, Post, Thread } from './types';

interface ApiEnvelope<T> {
  code: number;
  data: T;
}

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`Request failed (${status})`);
  }
}

let unauthorizedHandler: (() => void) | undefined;

export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, init?: RequestInit, notifyUnauthorized = true): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || payload.code !== 200) {
    if (response.status === 401 && path !== '/api/admin/login' && notifyUnauthorized) {
      unauthorizedHandler?.();
    }
    throw new ApiError(response.status);
  }
  return payload.data;
}

export const api = {
  health: () => request<null>('/api/admin/health', undefined, false),
  login: (password: string) => request<null>('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<null>('/api/admin/logout', { method: 'POST' }),
  listThreads: () => request<Thread[]>('/api/admin/thread/list'),
  refreshThreads: () => request<null>('/api/admin/thread/refresh', { method: 'POST' }),
  getThread: (id: number) => request<Thread>(`/api/admin/thread/meta/${id}`),
  updateThread: (thread: Thread) => request<Thread>('/api/admin/thread/meta', {
    method: 'PUT',
    body: JSON.stringify({ id: thread.id, title: thread.title, url: thread.url, locked: thread.locked }),
  }),
  listPosts: (threadId: number) => request<Post[]>(`/api/admin/thread/${threadId}`),
  getPost: (threadId: number, postId: number) => request<Post>(`/api/admin/posts/${threadId}/${postId}`),
  updatePost: (threadId: number, post: Post) =>
    request<Post>(`/api/admin/posts/${threadId}`, {
      method: 'PUT',
      body: JSON.stringify({
        id: post.id,
        name: post.name,
        email: post.email,
        website: post.website,
        content: post.content,
        hidden: post.hidden,
        receiveEmail: post.receiveEmail,
        byAdmin: post.byAdmin,
      }),
    }),
  createPost: (threadId: number, parent: number, content: string, identity: AdminIdentity) =>
    request<Post>(`/api/admin/posts/${threadId}`, {
      method: 'POST',
      body: JSON.stringify({ ...identity, parent, content }),
    }),
};
