export interface AdminSession {
  authVersion: string;
  expiresAt: number;
}

export interface AdminSessionStore {
  get(tokenDigest: string): Promise<AdminSession | null>;
  set(tokenDigest: string, session: AdminSession): Promise<void>;
  delete(tokenDigest: string): Promise<void>;
}

export interface LoginAttemptResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface LoginAttemptStore {
  check(key: string, limit: number): Promise<LoginAttemptResult>;
  consume(key: string, limit: number, windowMs: number): Promise<LoginAttemptResult>;
  reset(key: string): Promise<void>;
}

export interface AdminPasswordVerifier {
  verify(password: string): Promise<boolean>;
}
