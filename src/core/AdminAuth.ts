import { ServiceUnavailableError, TooManyRequestsError, UnauthorizedError } from './errors';
import type { AdminPasswordVerifier, AdminSessionStore, LoginAttemptStore } from './ports/admin-auth';
import { adminPasswordByteLength, normalizeAdminPassword } from './support/admin-password';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const IP_ATTEMPT_LIMIT = 5;
const IP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_ATTEMPT_LIMIT = 30;
const GLOBAL_ATTEMPT_WINDOW_MS = 60 * 1000;
const MAX_PASSWORD_BYTES = 1024;

export interface AdminAuthOptions {
  passwordVerifier: AdminPasswordVerifier;
  sessionStore: AdminSessionStore;
  loginAttemptStore: LoginAttemptStore;
  authVersion: string;
  now?: () => number;
}

export interface AdminLoginResult {
  token: string;
  expiresAt: number;
}

export class AdminAuth {
  private readonly now: () => number;

  constructor(private readonly options: AdminAuthOptions) {
    this.now = options.now ?? Date.now;
  }

  async login(password: unknown, clientId: string): Promise<AdminLoginResult> {
    if (typeof password !== 'string') {
      throw new UnauthorizedError();
    }

    const normalized = normalizeAdminPassword(password);
    if (!normalized || adminPasswordByteLength(normalized) > MAX_PASSWORD_BYTES) {
      throw new UnauthorizedError();
    }

    const clientKey = `admin-login:client:${await digest(clientId)}`;

    try {
      const clientStatus = await this.options.loginAttemptStore.check(clientKey, IP_ATTEMPT_LIMIT);
      if (!clientStatus.allowed) {
        throw new TooManyRequestsError(clientStatus.retryAfterSeconds);
      }

      const globalAttempt = await this.options.loginAttemptStore.consume(
        'admin-login:global',
        GLOBAL_ATTEMPT_LIMIT,
        GLOBAL_ATTEMPT_WINDOW_MS,
      );
      if (!globalAttempt.allowed) {
        throw new TooManyRequestsError(globalAttempt.retryAfterSeconds);
      }

      const clientAttempt = await this.options.loginAttemptStore.consume(
        clientKey,
        IP_ATTEMPT_LIMIT,
        IP_ATTEMPT_WINDOW_MS,
      );
      if (!clientAttempt.allowed) {
        throw new TooManyRequestsError(clientAttempt.retryAfterSeconds);
      }

      if (!(await this.options.passwordVerifier.verify(normalized))) {
        throw new UnauthorizedError();
      }

      await this.options.loginAttemptStore.reset(clientKey);
      const token = randomToken();
      const expiresAt = this.now() + SESSION_DURATION_MS;
      await this.options.sessionStore.set(await digest(token), {
        authVersion: this.options.authVersion,
        expiresAt,
      });
      return { token, expiresAt };
    } catch (error) {
      if (error instanceof UnauthorizedError || error instanceof TooManyRequestsError) {
        throw error;
      }
      throw new ServiceUnavailableError('admin authentication unavailable');
    }
  }

  async authenticate(token: string | null): Promise<boolean> {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      return false;
    }

    try {
      const tokenDigest = await digest(token);
      const session = await this.options.sessionStore.get(tokenDigest);
      if (!session) {
        return false;
      }
      if (session.expiresAt <= this.now() || session.authVersion !== this.options.authVersion) {
        await this.options.sessionStore.delete(tokenDigest);
        return false;
      }
      return true;
    } catch {
      throw new ServiceUnavailableError('admin authentication unavailable');
    }
  }

  async logout(token: string | null): Promise<void> {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      return;
    }

    try {
      await this.options.sessionStore.delete(await digest(token));
    } catch {
      throw new ServiceUnavailableError('admin authentication unavailable');
    }
  }
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
