import { isIP } from 'node:net';
import { AdminAuth, PommentCore } from '../core';
import {
  BunAdminPasswordVerifier,
  BunSqliteStorage,
  MemoryAdminAuthStore,
  RedisAdminAuthStore,
} from '../runtime-bun';
import { createHandler } from './routes';

const port = Number(Bun.env.PORT ?? 8080);
const databasePath = Bun.env.POMMENT_DB ?? 'pomment.db';
const secureAdminCookie = Bun.env.POMMENT_AUTH_INSECURE_COOKIE !== 'true';

const storage = new BunSqliteStorage({ filename: databasePath });
const core = new PommentCore({ storage });
const adminOrigin = parseAdminOrigin(Bun.env.POMMENT_ADMIN_ORIGIN);
const adminAuth = await createAdminAuth();
const handler = createHandler(core, {
  adminAuth,
  adminOrigin,
  secureAdminCookie,
  onAdminAuthEvent: (event, clientIp) => {
    console.log(JSON.stringify({ scope: 'admin-auth', event, clientIp }));
  },
});

Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch(request, server) {
    const peer = server.requestIP(request)?.address ?? null;
    return handler(request, { clientIp: clientIpFromProxy(request, peer) });
  },
});

if (!secureAdminCookie) {
  console.warn('WARNING: admin session cookies are allowed over insecure HTTP');
}
console.log(`Pomment Bun server listening on http://127.0.0.1:${port}`);

async function createAdminAuth(): Promise<AdminAuth | undefined> {
  const passwordHash = Bun.env.POMMENT_ADMIN_PASSWORD_HASH;
  const storeName = Bun.env.POMMENT_SESSION_STORE;
  if (!passwordHash || !storeName) {
    console.warn('Admin routes disabled: POMMENT_ADMIN_PASSWORD_HASH and POMMENT_SESSION_STORE are required');
    return undefined;
  }

  try {
    const passwordVerifier = new BunAdminPasswordVerifier(passwordHash);
    const store = storeName === 'memory'
      ? new MemoryAdminAuthStore()
      : storeName === 'redis' && Bun.env.POMMENT_REDIS_URL
        ? new RedisAdminAuthStore(Bun.env.POMMENT_REDIS_URL)
        : undefined;
    if (!store) {
      console.warn('Admin routes disabled: session store must be memory or redis with POMMENT_REDIS_URL');
      return undefined;
    }
    return new AdminAuth({
      passwordVerifier,
      sessionStore: store,
      loginAttemptStore: store,
      authVersion: await sha256(passwordHash),
    });
  } catch (error) {
    console.warn(`Admin routes disabled: ${error instanceof Error ? error.message : 'invalid authentication config'}`);
    return undefined;
  }
}

function parseAdminOrigin(value: string | undefined): string | undefined {
  if (!value) {
    console.warn('Admin routes disabled: POMMENT_ADMIN_ORIGIN is required');
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.origin !== value || url.pathname !== '/') {
      throw new Error();
    }
    return url.origin;
  } catch {
    console.warn('Admin routes disabled: POMMENT_ADMIN_ORIGIN must be an exact origin without a path');
    return undefined;
  }
}

function clientIpFromProxy(request: Request, peer: string | null): string | null {
  if (!peer || !isLoopback(peer)) {
    return null;
  }
  const forwarded = request.headers.get('x-real-ip')?.trim();
  return forwarded && isIP(forwarded) ? forwarded : null;
}

function isLoopback(address: string): boolean {
  return address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1';
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
