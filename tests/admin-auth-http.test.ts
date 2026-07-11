import { describe, expect, test } from 'bun:test';
import { AdminAuth, type AdminPasswordVerifier, type PommentCore } from '../src/core';
import { createHandler } from '../src/entry-bun/routes';
import { MemoryAdminAuthStore } from '../src/runtime-bun';

const origin = 'https://admin.example.com';

class PasswordVerifier implements AdminPasswordVerifier {
  async verify(password: string): Promise<boolean> {
    return password === 'correct horse battery staple';
  }
}

function setup() {
  const store = new MemoryAdminAuthStore();
  const auth = new AdminAuth({
    passwordVerifier: new PasswordVerifier(),
    sessionStore: store,
    loginAttemptStore: store,
    authVersion: 'version-1',
  });
  const rawHandler = createHandler({} as PommentCore, { adminAuth: auth, adminOrigin: origin });
  return (request: Request) => rawHandler(request, { clientIp: '192.0.2.10' });
}

describe('admin HTTP authentication', () => {
  test('protects admin routes and manages the cookie lifecycle', async () => {
    const handler = setup();
    const unauthorized = await handler(new Request(`${origin}/admin/health`));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('cache-control')).toBe('no-store');

    const invalidOrigin = await handler(new Request(`${origin}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
      body: JSON.stringify({ password: 'correct horse battery staple' }),
    }));
    expect(invalidOrigin.status).toBe(403);

    const login = await handler(new Request(`${origin}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ password: 'correct horse battery staple' }),
    }));
    expect(login.status).toBe(200);
    const setCookie = login.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('Path=/admin');
    const cookie = setCookie.split(';', 1)[0];

    const authorized = await handler(new Request(`${origin}/admin/health`, { headers: { cookie } }));
    expect(authorized.status).toBe(200);

    const logout = await handler(new Request(`${origin}/admin/logout`, {
      method: 'POST',
      headers: { cookie, origin },
    }));
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');

    const revoked = await handler(new Request(`${origin}/admin/health`, { headers: { cookie } }));
    expect(revoked.status).toBe(401);
  });

  test('limits login bodies and fails closed without auth configuration', async () => {
    const handler = setup();
    const oversized = await handler(new Request(`${origin}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ password: 'x'.repeat(5000) }),
    }));
    expect(oversized.status).toBe(413);

    const unavailableHandler = createHandler({} as PommentCore);
    const unavailable = await unavailableHandler(new Request(`${origin}/admin/health`));
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('cache-control')).toBe('no-store');
  });
});
