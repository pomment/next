import { describe, expect, test } from 'bun:test';
import {
  AdminAuth,
  TooManyRequestsError,
  UnauthorizedError,
  type AdminPasswordVerifier,
} from '../src/core';
import { MemoryAdminAuthStore } from '../src/runtime-bun';

class PasswordVerifier implements AdminPasswordVerifier {
  lastPassword = '';

  async verify(password: string): Promise<boolean> {
    this.lastPassword = password;
    return password === 'correct horse battery staple';
  }
}

describe('AdminAuth', () => {
  test('creates, expires, and revokes opaque sessions', async () => {
    let now = 1_000;
    const store = new MemoryAdminAuthStore(() => now);
    const auth = new AdminAuth({
      passwordVerifier: new PasswordVerifier(),
      sessionStore: store,
      loginAttemptStore: store,
      authVersion: 'version-1',
      now: () => now,
    });

    const session = await auth.login('correct horse battery staple', '127.0.0.1');
    expect(session.token).toMatch(/^[0-9a-f]{64}$/);
    expect(await auth.authenticate(session.token)).toBe(true);

    await auth.logout(session.token);
    expect(await auth.authenticate(session.token)).toBe(false);

    const expiring = await auth.login('correct horse battery staple', '127.0.0.1');
    now = expiring.expiresAt;
    expect(await auth.authenticate(expiring.token)).toBe(false);
  });

  test('invalidates sessions when the authentication version changes', async () => {
    const store = new MemoryAdminAuthStore();
    const first = new AdminAuth({
      passwordVerifier: new PasswordVerifier(),
      sessionStore: store,
      loginAttemptStore: store,
      authVersion: 'version-1',
    });
    const session = await first.login('correct horse battery staple', '127.0.0.1');
    const rotated = new AdminAuth({
      passwordVerifier: new PasswordVerifier(),
      sessionStore: store,
      loginAttemptStore: store,
      authVersion: 'version-2',
    });

    expect(await rotated.authenticate(session.token)).toBe(false);
  });

  test('normalizes passwords and rate limits failed client attempts', async () => {
    const verifier = new PasswordVerifier();
    const store = new MemoryAdminAuthStore();
    const auth = new AdminAuth({
      passwordVerifier: verifier,
      sessionStore: store,
      loginAttemptStore: store,
      authVersion: 'version-1',
    });

    await expect(auth.login('e\u0301', '192.0.2.1')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(verifier.lastPassword).toBe('\u00e9');

    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(auth.login('wrong password', '192.0.2.1')).rejects.toBeInstanceOf(UnauthorizedError);
    }
    await expect(auth.login('wrong password', '192.0.2.1')).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  test('does not consume a client failure slot while globally limited', async () => {
    let now = 1_000;
    const store = new MemoryAdminAuthStore(() => now);
    const auth = new AdminAuth({
      passwordVerifier: new PasswordVerifier(),
      sessionStore: store,
      loginAttemptStore: store,
      authVersion: 'version-1',
      now: () => now,
    });

    for (let attempt = 0; attempt < 30; attempt++) {
      await expect(auth.login('wrong password', `192.0.2.${attempt}`)).rejects.toBeInstanceOf(UnauthorizedError);
    }
    await expect(auth.login('wrong password', '198.51.100.1')).rejects.toBeInstanceOf(TooManyRequestsError);

    now += 60_000;
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(auth.login('wrong password', '198.51.100.1')).rejects.toBeInstanceOf(UnauthorizedError);
    }
    await expect(auth.login('wrong password', '198.51.100.1')).rejects.toBeInstanceOf(TooManyRequestsError);
  });
});
