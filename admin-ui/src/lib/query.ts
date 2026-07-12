import { QueryClient } from '@tanstack/react-query';
import { setUnauthorizedHandler } from '../api';

export const queryKeys = {
  session: ['session'] as const,
  threads: ['threads'] as const,
  thread: (id: number) => ['threads', id] as const,
  posts: (threadId: number) => ['threads', threadId, 'posts'] as const,
  post: (threadId: number, postId: number) => ['threads', threadId, 'posts', postId] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: false },
    mutations: { retry: false },
  },
});

export function clearAdminData(): void {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.session[0] });
}

setUnauthorizedHandler(() => {
  clearAdminData();
  void queryClient.resetQueries({ queryKey: queryKeys.session });
});
