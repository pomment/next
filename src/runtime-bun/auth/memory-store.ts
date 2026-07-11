import type {
  AdminSession,
  AdminSessionStore,
  LoginAttemptResult,
  LoginAttemptStore,
} from '../../core';

interface AttemptWindow {
  count: number;
  expiresAt: number;
}

export class MemoryAdminAuthStore implements AdminSessionStore, LoginAttemptStore {
  private readonly sessions = new Map<string, AdminSession>();
  private readonly attempts = new Map<string, AttemptWindow>();
  private nextAttemptSweepAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  async get(tokenDigest: string): Promise<AdminSession | null> {
    const session = this.sessions.get(tokenDigest);
    if (!session || session.expiresAt <= this.now()) {
      this.sessions.delete(tokenDigest);
      return null;
    }
    return session;
  }

  async set(tokenDigest: string, session: AdminSession): Promise<void> {
    this.sessions.set(tokenDigest, session);
  }

  async delete(tokenDigest: string): Promise<void> {
    this.sessions.delete(tokenDigest);
  }

  async check(key: string, limit: number): Promise<LoginAttemptResult> {
    const now = this.now();
    this.sweepAttempts(now);
    const current = this.attempts.get(key);
    if (!current || current.expiresAt <= now) {
      this.attempts.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return {
      allowed: current.count < limit,
      retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)),
    };
  }

  async consume(key: string, limit: number, windowMs: number): Promise<LoginAttemptResult> {
    const now = this.now();
    this.sweepAttempts(now);
    const current = this.attempts.get(key);
    const next = !current || current.expiresAt <= now
      ? { count: 1, expiresAt: now + windowMs }
      : { ...current, count: current.count + 1 };
    this.attempts.set(key, next);
    return {
      allowed: next.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((next.expiresAt - now) / 1000)),
    };
  }

  async reset(key: string): Promise<void> {
    this.attempts.delete(key);
  }

  private sweepAttempts(now: number): void {
    if (now < this.nextAttemptSweepAt) {
      return;
    }
    for (const [key, attempt] of this.attempts) {
      if (attempt.expiresAt <= now) {
        this.attempts.delete(key);
      }
    }
    this.nextAttemptSweepAt = now + 60_000;
  }
}
