import { describe, expect, test } from 'bun:test';
import { parseCorsOrigins, withPublicCors } from '../src/entry-bun/cors';

const blogOrigin = 'https://blog.example.com';
const wwwOrigin = 'https://www.example.com';
const allowedOrigins = new Set([blogOrigin, wwwOrigin]);

describe('public API CORS', () => {
  test('parses exact HTTP origins', () => {
    expect([...parseCorsOrigins(` ${blogOrigin},${wwwOrigin},${blogOrigin} `)]).toEqual([blogOrigin, wwwOrigin]);
    expect(parseCorsOrigins(undefined).size).toBe(0);
    expect(parseCorsOrigins('   ').size).toBe(0);
  });

  test('rejects malformed and non-exact origins', () => {
    for (const value of [
      `${blogOrigin}/`,
      `${blogOrigin}/posts`,
      `${blogOrigin}?preview=true`,
      'ftp://blog.example.com',
      `${blogOrigin},`,
    ]) {
      expect(() => parseCorsOrigins(value)).toThrow('Invalid POMMENT_CORS_ORIGINS entry');
    }
  });

  test('adds CORS headers to public responses for allowed origins', async () => {
    const handler = withPublicCors(
      async () => new Response('failed', { status: 418, headers: { vary: 'Accept-Encoding' } }),
      allowedOrigins,
    );
    const response = await handler(
      new Request('https://comments.example.com/api/public/posts/1', { headers: { origin: blogOrigin } }),
    );

    expect(response.status).toBe(418);
    expect(response.headers.get('access-control-allow-origin')).toBe(blogOrigin);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin');
  });

  test('answers allowed preflight requests without dispatching them', async () => {
    let dispatched = false;
    const handler = withPublicCors(async () => {
      dispatched = true;
      return new Response(null, { status: 404 });
    }, allowedOrigins);
    const response = await handler(
      new Request('https://comments.example.com/api/public/posts/add', {
        method: 'OPTIONS',
        headers: {
          origin: blogOrigin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(blogOrigin);
    expect(response.headers.get('vary')).toBe('Origin');
    expect(dispatched).toBeFalse();
  });

  test('does not authorize unknown origins or apply CORS to admin routes', async () => {
    const handler = withPublicCors(async () => new Response(null, { status: 404 }), allowedOrigins);
    const denied = await handler(
      new Request('https://comments.example.com/api/public/posts/1', {
        headers: { origin: 'https://attacker.example' },
      }),
    );
    const admin = await handler(
      new Request('https://comments.example.com/api/admin/health', { headers: { origin: blogOrigin } }),
    );

    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    expect(denied.headers.get('vary')).toBe('Origin');
    expect(admin.headers.get('access-control-allow-origin')).toBeNull();
    expect(admin.headers.get('vary')).toBeNull();
  });
});
