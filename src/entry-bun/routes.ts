import type { AdminAuth, BackupImportPort, PommentCore, StartBackupImportInput } from '../core';
import type {
  AdminEditPostInput,
  CreateAdminPostInput,
  CreateUserPostInput,
  ImportThreadInput,
} from '../core/domain/post';
import type { UpdateThreadInput } from '../core/domain/thread';
import {
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../core/errors';
import { readBytesLimited, readJson, readJsonLimited } from './body';
import { matchPath } from './params';
import { jsonError, jsonSuccess, text } from './responses';

export type Handler = (request: Request, params: Record<string, string>) => Promise<Response>;

interface Route {
  method: string;
  path: string;
  handler: Handler;
  publicAdmin?: boolean;
}

export interface RequestContext {
  clientIp: string | null;
}

export type AdminAuthEvent = 'login-success' | 'login-rate-limited' | 'logout' | 'unavailable';

export interface HandlerOptions {
  adminAuth?: AdminAuth;
  adminOrigin?: string;
  secureAdminCookie?: boolean;
  backupImport?: BackupImportPort;
  onAdminAuthEvent?: (event: AdminAuthEvent, clientIp: string | null) => void;
}

const ADMIN_COOKIE = 'pomment_admin_session';

export function createHandler(
  core: PommentCore,
  options: HandlerOptions = {},
): (request: Request, context?: RequestContext) => Promise<Response> {
  const routes: Route[] = [
    {
      method: 'GET',
      path: '/api/health',
      handler: async () => jsonSuccess(null),
    },
    {
      method: 'POST',
      path: '/api/admin/login',
      publicAdmin: true,
      handler: async (request) => {
        const body = await readJsonLimited<{ password?: unknown }>(request, 4096);
        const clientIp = requestContext.get(request)?.clientIp;
        if (!clientIp) {
          throw new ServiceUnavailableError('client IP unavailable');
        }
        const result = await options.adminAuth!.login(body.password, clientIp);
        const response = jsonSuccess(null);
        response.headers.append(
          'set-cookie',
          sessionCookie(result.token, result.expiresAt, options.secureAdminCookie !== false),
        );
        options.onAdminAuthEvent?.('login-success', clientIp);
        return response;
      },
    },
    {
      method: 'POST',
      path: '/api/admin/logout',
      handler: async (request) => {
        const clientIp = requestContext.get(request)?.clientIp ?? null;
        await options.adminAuth!.logout(readCookie(request, ADMIN_COOKIE));
        const response = jsonSuccess(null);
        response.headers.append('set-cookie', clearSessionCookie(options.secureAdminCookie !== false));
        options.onAdminAuthEvent?.('logout', clientIp);
        return response;
      },
    },
    {
      method: 'GET',
      path: '/api/admin/health',
      handler: async () => jsonSuccess(null),
    },
    {
      method: 'GET',
      path: '/api/admin/backup/import',
      handler: async () => jsonSuccess(await options.backupImport!.getActiveSession()),
    },
    {
      method: 'POST',
      path: '/api/admin/backup/import',
      handler: async (request) => {
        const body = await readJsonLimited<StartBackupImportInput>(request, 64 * 1024);
        return jsonSuccess(await options.backupImport!.start(body));
      },
    },
    {
      method: 'PUT',
      path: '/api/admin/backup/import/:id/batches/:sequence',
      handler: async (request, params) => {
        const digest = request.headers.get('x-pomment-batch-sha256') ?? '';
        const bytes = await readBytesLimited(request, 1024 * 1024 + 1);
        return jsonSuccess(await options.backupImport!.appendBatch(params.id, Number(params.sequence), digest, bytes));
      },
    },
    {
      method: 'POST',
      path: '/api/admin/backup/import/:id/complete',
      handler: async (_request, params) => jsonSuccess(await options.backupImport!.complete(params.id)),
    },
    {
      method: 'DELETE',
      path: '/api/admin/backup/import/:id',
      handler: async (_request, params) => {
        await options.backupImport!.abort(params.id);
        return jsonSuccess(null);
      },
    },
    {
      method: 'GET',
      path: '/robots.txt',
      handler: async () => text('User-Agent: *\nDisallow: /\n'),
    },
    {
      method: 'GET',
      path: '/api/public/thread/meta/:id',
      handler: async (_request, params) => jsonSuccess(await core.getThreadMetaById(Number(params.id))),
    },
    {
      method: 'POST',
      path: '/api/public/thread/meta/byUrl',
      handler: async (request) => {
        const body = await readJson<{ url: string }>(request);
        return jsonSuccess(await core.getThreadMetaByUrl(body.url));
      },
    },
    {
      method: 'POST',
      path: '/api/public/thread/meta/byUrls',
      handler: async (request) => {
        const body = await readJson<string[]>(request);
        return jsonSuccess(await core.getThreadMetaByUrls(body));
      },
    },
    {
      method: 'GET',
      path: '/api/public/posts/:id',
      handler: async (_request, params) => jsonSuccess(await core.listPublicPostsById(Number(params.id))),
    },
    {
      method: 'POST',
      path: '/api/public/posts/byUrl',
      handler: async (request) => {
        const body = await readJson<{ url: string }>(request);
        return jsonSuccess(await core.listPublicPostsByUrl(body.url));
      },
    },
    {
      method: 'POST',
      path: '/api/public/posts/add',
      handler: async (request) => {
        const body = await readJson<CreateUserPostInput>(request);
        return jsonSuccess(await core.createUserPost(body));
      },
    },
    {
      method: 'GET',
      path: '/api/admin/thread/list',
      handler: async () => jsonSuccess(await core.listThreads()),
    },
    {
      method: 'GET',
      path: '/api/admin/thread/:id',
      handler: async (_request, params) => jsonSuccess(await core.listAllPostsById(Number(params.id))),
    },
    {
      method: 'POST',
      path: '/api/admin/thread/refresh',
      handler: async () => {
        await core.refreshAllThreadMeta();
        return jsonSuccess(null);
      },
    },
    {
      method: 'GET',
      path: '/api/admin/thread/meta/:id',
      handler: async (_request, params) => jsonSuccess(await core.getThreadMetaById(Number(params.id))),
    },
    {
      method: 'PUT',
      path: '/api/admin/thread/meta',
      handler: async (request) => jsonSuccess(await core.updateThreadMeta(await readJson<UpdateThreadInput>(request))),
    },
    {
      method: 'POST',
      path: '/api/admin/thread/import',
      handler: async (request) => {
        const body = await readJson<ImportThreadInput>(request);
        return jsonSuccess(await core.importThread(body));
      },
    },
    {
      method: 'GET',
      path: '/api/admin/posts/:threadId/:postId',
      handler: async (_request, params) =>
        jsonSuccess(await core.getPost(Number(params.threadId), Number(params.postId))),
    },
    {
      method: 'POST',
      path: '/api/admin/posts/:id',
      handler: async (request, params) => {
        const body = await readJson<Omit<CreateAdminPostInput, 'threadId'>>(request);
        return jsonSuccess(await core.createAdminPost({ ...body, threadId: Number(params.id) }));
      },
    },
    {
      method: 'PUT',
      path: '/api/admin/posts/:id',
      handler: async (request, params) => {
        const body = await readJson<AdminEditPostInput>(request);
        return jsonSuccess(await core.editPost({ ...body, threadId: Number(params.id), alterEditTime: true }));
      },
    },
  ];

  return async (request, context = { clientIp: null }) => {
    requestContext.set(request, context);
    const pathname = new URL(request.url).pathname;
    try {
      const url = new URL(request.url);

      if (pathname.startsWith('/api/public/') && options.backupImport && (await options.backupImport.isImporting())) {
        throw new ServiceUnavailableError('backup import is in progress');
      }

      for (const route of routes) {
        if (route.method !== request.method) {
          continue;
        }

        const matched = matchPath(route.path, url.pathname);
        if (matched) {
          if (route.path.startsWith('/api/admin/')) {
            if (!options.adminAuth || !options.adminOrigin) {
              throw new ServiceUnavailableError('admin authentication is not configured');
            }
            if (!route.publicAdmin && !(await options.adminAuth.authenticate(readCookie(request, ADMIN_COOKIE)))) {
              throw new UnauthorizedError();
            }
            if (isUnsafeMethod(request.method) && request.headers.get('origin') !== options.adminOrigin) {
              throw new ForbiddenError('invalid origin');
            }
            if (route.path.startsWith('/api/admin/backup/') && !options.backupImport) {
              throw new ServiceUnavailableError('backup import is unavailable');
            }
            if (
              !route.path.startsWith('/api/admin/backup/') &&
              !isImportSafeAdminPath(route.path) &&
              options.backupImport &&
              (await options.backupImport.isImporting())
            ) {
              throw new ServiceUnavailableError('backup import is in progress');
            }
          }
          return withAdminHeaders(await route.handler(request, matched.params), pathname);
        }
      }

      throw new NotFoundError('route not found');
    } catch (error) {
      if (pathname.startsWith('/api/admin/') && error instanceof ServiceUnavailableError) {
        options.onAdminAuthEvent?.('unavailable', context.clientIp);
      }
      if (pathname === '/api/admin/login' && error instanceof TooManyRequestsError) {
        options.onAdminAuthEvent?.('login-rate-limited', context.clientIp);
      }
      return withAdminHeaders(jsonError(error), pathname);
    } finally {
      requestContext.delete(request);
    }
  };
}

const requestContext = new WeakMap<Request, RequestContext>();

function readCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get('cookie');
  if (!cookies) {
    return null;
  }
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function sessionCookie(token: string, expiresAt: number, secure: boolean): string {
  const attributes = [
    `${ADMIN_COOKIE}=${token}`,
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${24 * 60 * 60}`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (secure) {
    attributes.push('Secure');
  }
  return attributes.join('; ');
}

function clearSessionCookie(secure: boolean): string {
  const attributes = [
    `${ADMIN_COOKIE}=`,
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (secure) {
    attributes.push('Secure');
  }
  return attributes.join('; ');
}

function isUnsafeMethod(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

function isImportSafeAdminPath(path: string): boolean {
  return path === '/api/admin/login' || path === '/api/admin/logout' || path === '/api/admin/health';
}

function withAdminHeaders(response: Response, pathname: string): Response {
  if (pathname.startsWith('/api/admin/')) {
    response.headers.set('cache-control', 'no-store');
  }
  return response;
}
