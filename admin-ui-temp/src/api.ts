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
    if (response.status === 401 && path !== '/admin/login' && notifyUnauthorized) {
      unauthorizedHandler?.();
    }
    throw new ApiError(response.status);
  }
  return payload.data;
}

export const api = {
  health: () => request<null>('/admin/health', undefined, false),
  login: (password: string) => request<null>('/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<null>('/admin/logout', { method: 'POST' }),
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
