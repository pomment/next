import { PommentError, TooManyRequestsError } from '../core/errors';

export interface ApiResponse<T> {
  code: number;
  data: T;
}

export function jsonSuccess<T>(data: T): Response {
  return json({ code: 200, data }, 200);
}

export function jsonError(error: unknown): Response {
  if (error instanceof PommentError) {
    const response = json({ code: error.status, data: null }, error.status);
    if (error instanceof TooManyRequestsError) {
      response.headers.set('retry-after', String(error.retryAfterSeconds));
    }
    return response;
  }

  return json({ code: 500, data: null }, 500);
}

export function json<T>(body: ApiResponse<T>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

export function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}
