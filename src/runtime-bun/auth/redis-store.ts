import { RedisClient } from 'bun';
import type { AdminSession, AdminSessionStore, LoginAttemptResult, LoginAttemptStore } from '../../core';

const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('PTTL', KEYS[1])}
`;

const CHECK_SCRIPT = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
return {count, redis.call('PTTL', KEYS[1])}
`;

export class RedisAdminAuthStore implements AdminSessionStore, LoginAttemptStore {
  private readonly client: RedisClient;

  constructor(url: string) {
    this.client = new RedisClient(url, {
      connectionTimeout: 500,
      enableOfflineQueue: false,
      maxRetries: 0,
    });
  }

  async get(tokenDigest: string): Promise<AdminSession | null> {
    const key = sessionKey(tokenDigest);
    const value = await this.client.get(key);
    if (!value) {
      return null;
    }
    try {
      const session = JSON.parse(value) as AdminSession;
      if (typeof session.authVersion !== 'string' || typeof session.expiresAt !== 'number') {
        await this.client.del(key);
        return null;
      }
      return session;
    } catch {
      await this.client.del(key);
      return null;
    }
  }

  async set(tokenDigest: string, session: AdminSession): Promise<void> {
    const ttl = session.expiresAt - Date.now();
    if (ttl <= 0) {
      return;
    }
    await this.client.set(sessionKey(tokenDigest), JSON.stringify(session), 'PX', ttl);
  }

  async delete(tokenDigest: string): Promise<void> {
    await this.client.del(sessionKey(tokenDigest));
  }

  async check(key: string, limit: number): Promise<LoginAttemptResult> {
    const result = (await this.client.send('EVAL', [CHECK_SCRIPT, '1', attemptKey(key)])) as [number, number];
    return {
      allowed: Number(result[0]) < limit,
      retryAfterSeconds: Math.max(1, Math.ceil(Number(result[1]) / 1000)),
    };
  }

  async consume(key: string, limit: number, windowMs: number): Promise<LoginAttemptResult> {
    const result = (await this.client.send('EVAL', [CONSUME_SCRIPT, '1', attemptKey(key), String(windowMs)])) as [
      number,
      number,
    ];
    return {
      allowed: Number(result[0]) <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil(Number(result[1]) / 1000)),
    };
  }

  async reset(key: string): Promise<void> {
    await this.client.del(attemptKey(key));
  }

  close(): void {
    this.client.close();
  }
}

function sessionKey(tokenDigest: string): string {
  return `pomment:auth:session:${tokenDigest}`;
}

function attemptKey(key: string): string {
  return `pomment:auth:attempt:${key}`;
}
