const PUBLIC_API_PREFIX = '/api/public/';

export function parseCorsOrigins(value: string | undefined): ReadonlySet<string> {
  const origins = new Set<string>();
  if (!value?.trim()) {
    return origins;
  }

  for (const entry of value.split(',')) {
    const origin = entry.trim();
    try {
      const url = new URL(origin);
      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.origin !== origin ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(`Invalid POMMENT_CORS_ORIGINS entry: ${origin || '(empty)'}`);
    }
    origins.add(origin);
  }

  return origins;
}

export function withPublicCors<TArgs extends unknown[]>(
  handler: (request: Request, ...args: TArgs) => Promise<Response>,
  allowedOrigins: ReadonlySet<string>,
): (request: Request, ...args: TArgs) => Promise<Response> {
  if (allowedOrigins.size === 0) {
    return handler;
  }

  return async (request, ...args) => {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith(PUBLIC_API_PREFIX)) {
      return handler(request, ...args);
    }

    const origin = request.headers.get('origin');
    if (
      request.method === 'OPTIONS' &&
      request.headers.has('access-control-request-method') &&
      origin !== null &&
      allowedOrigins.has(origin)
    ) {
      return applyCorsHeaders(new Response(null, { status: 204 }), origin);
    }

    const response = await handler(request, ...args);
    appendVaryOrigin(response.headers);
    if (origin !== null && allowedOrigins.has(origin)) {
      applyCorsHeaders(response, origin);
    }
    return response;
  };
}

function applyCorsHeaders(response: Response, origin: string): Response {
  response.headers.set('access-control-allow-origin', origin);
  response.headers.set('access-control-allow-methods', 'GET, POST');
  response.headers.set('access-control-allow-headers', 'Content-Type');
  appendVaryOrigin(response.headers);
  return response;
}

function appendVaryOrigin(headers: Headers): void {
  const vary = headers.get('vary');
  if (!vary) {
    headers.set('vary', 'Origin');
    return;
  }
  if (vary === '*' || vary.split(',').some((value) => value.trim().toLowerCase() === 'origin')) {
    return;
  }
  headers.set('vary', `${vary}, Origin`);
}
