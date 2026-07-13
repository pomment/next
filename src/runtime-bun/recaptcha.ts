import type { CaptchaPort } from '../core/ports/captcha';

export interface RecaptchaConfig {
  secretKey: string;
  minimumScore: number;
  apiUrl?: string;
  timeoutMs?: number;
}

interface RecaptchaVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

export class RecaptchaCaptchaPort implements CaptchaPort {
  private readonly secretKey: string;
  private readonly minimumScore: number;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;

  constructor(config: RecaptchaConfig) {
    this.secretKey = config.secretKey;
    this.minimumScore = config.minimumScore;
    this.apiUrl = config.apiUrl ?? 'https://www.google.com/recaptcha/api/siteverify';
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  async verify(response: string): Promise<{ passed: boolean; score?: number }> {
    const body = new URLSearchParams({
      secret: this.secretKey,
      response,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: controller.signal,
      });

      if (!res.ok) {
        return { passed: false };
      }

      const data = (await res.json()) as RecaptchaVerifyResponse;
      if (!data.success) {
        return { passed: false };
      }

      const score = data.score ?? 0;
      return { passed: score >= this.minimumScore, score };
    } catch {
      return { passed: false };
    } finally {
      clearTimeout(timer);
    }
  }
}
