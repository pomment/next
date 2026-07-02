import type { PommentCore } from '../core';
import type { CreateAdminPostInput, CreateUserPostInput, ImportThreadInput, Post } from '../core/domain/post';
import type { Thread } from '../core/domain/thread';
import { NotFoundError } from '../core/errors';
import { readJson } from './body';
import { matchPath } from './params';
import { jsonError, jsonSuccess, text } from './responses';

export type Handler = (request: Request, params: Record<string, string>) => Promise<Response>;

interface Route {
  method: string;
  path: string;
  handler: Handler;
}

export function createHandler(core: PommentCore): (request: Request) => Promise<Response> {
  const routes: Route[] = [
    {
      method: 'GET',
      path: '/health',
      handler: async () => jsonSuccess(null),
    },
    {
      method: 'GET',
      path: '/admin/health',
      handler: async () => jsonSuccess(null),
    },
    {
      method: 'GET',
      path: '/robots.txt',
      handler: async () => text('User-Agent: *\nDisallow: /\n'),
    },
    {
      method: 'GET',
      path: '/public/thread/meta/:id',
      handler: async (_request, params) => jsonSuccess(await core.getThreadMetaById(Number(params.id))),
    },
    {
      method: 'POST',
      path: '/public/thread/meta/byUrl',
      handler: async request => {
        const body = await readJson<{ url: string }>(request);
        return jsonSuccess(await core.getThreadMetaByUrl(body.url));
      },
    },
    {
      method: 'POST',
      path: '/public/thread/meta/byUrls',
      handler: async request => {
        const body = await readJson<string[]>(request);
        return jsonSuccess(await core.getThreadMetaByUrls(body));
      },
    },
    {
      method: 'GET',
      path: '/public/posts/:id',
      handler: async (_request, params) => jsonSuccess(await core.listPublicPostsById(Number(params.id))),
    },
    {
      method: 'POST',
      path: '/public/posts/byUrl',
      handler: async request => {
        const body = await readJson<{ url: string }>(request);
        return jsonSuccess(await core.listPublicPostsByUrl(body.url));
      },
    },
    {
      method: 'POST',
      path: '/public/posts/add',
      handler: async request => {
        const body = await readJson<CreateUserPostInput>(request);
        return jsonSuccess(await core.createUserPost(body));
      },
    },
    {
      method: 'GET',
      path: '/admin/thread/list',
      handler: async () => jsonSuccess(await core.listThreads()),
    },
    {
      method: 'GET',
      path: '/admin/thread/:id',
      handler: async (_request, params) => jsonSuccess(await core.listAllPostsById(Number(params.id))),
    },
    {
      method: 'POST',
      path: '/admin/thread/refresh',
      handler: async () => {
        await core.refreshAllThreadMeta();
        return jsonSuccess(null);
      },
    },
    {
      method: 'GET',
      path: '/admin/thread/meta/:id',
      handler: async (_request, params) => jsonSuccess(await core.getThreadMetaById(Number(params.id))),
    },
    {
      method: 'PUT',
      path: '/admin/thread/meta',
      handler: async request => jsonSuccess(await core.updateThreadMeta(await readJson<Thread>(request))),
    },
    {
      method: 'POST',
      path: '/admin/thread/import',
      handler: async request => {
        const body = await readJson<ImportThreadInput>(request);
        return jsonSuccess(await core.importThread(body));
      },
    },
    {
      method: 'GET',
      path: '/admin/posts/:threadId/:postId',
      handler: async (_request, params) => jsonSuccess(await core.getPost(Number(params.threadId), Number(params.postId))),
    },
    {
      method: 'POST',
      path: '/admin/posts/:id',
      handler: async (request, params) => {
        const body = await readJson<Omit<CreateAdminPostInput, 'threadId'>>(request);
        return jsonSuccess(await core.createAdminPost({ ...body, threadId: Number(params.id) }));
      },
    },
    {
      method: 'PUT',
      path: '/admin/posts/:id',
      handler: async (request, params) => {
        const body = await readJson<Post>(request);
        return jsonSuccess(await core.editPost({ threadId: Number(params.id), post: body, alterEditTime: true }));
      },
    },
  ];

  return async request => {
    try {
      const url = new URL(request.url);

      for (const route of routes) {
        if (route.method !== request.method) {
          continue;
        }

        const matched = matchPath(route.path, url.pathname);
        if (matched) {
          return await route.handler(request, matched.params);
        }
      }

      throw new NotFoundError('route not found');
    } catch (error) {
      return jsonError(error);
    }
  };
}
