import { describe, expect, mock, test, afterEach } from 'bun:test';
import { RecaptchaCaptchaPort } from '../src/runtime-bun/recaptcha';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchJson(status: number, body: unknown): void {
  globalThis.fetch = mock((_url: unknown, _init: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  ) as unknown as typeof fetch;
}

describe('RecaptchaCaptchaPort', () => {
  test('returns passed=true when score meets threshold', async () => {
    mockFetchJson(200, { success: true, score: 0.9 });

    const port = new RecaptchaCaptchaPort({ secretKey: 'test-secret', minimumScore: 0.5 });
    const result = await port.verify('valid-token');

    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.9);
  });

  test('returns passed=false when score below threshold', async () => {
    mockFetchJson(200, { success: true, score: 0.2 });

    const port = new RecaptchaCaptchaPort({ secretKey: 'test-secret', minimumScore: 0.5 });
    const result = await port.verify('low-score-token');

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.2);
  });

  test('returns passed=false when google reports failure', async () => {
    mockFetchJson(200, { success: false, 'error-codes': ['timeout-or-duplicate'] });

    const port = new RecaptchaCaptchaPort({ secretKey: 'test-secret', minimumScore: 0.5 });
    const result = await port.verify('bad-token');

    expect(result.passed).toBe(false);
    expect(result.score).toBeUndefined();
  });

  test('returns passed=false on non-200 response', async () => {
    mockFetchJson(500, { success: false });

    const port = new RecaptchaCaptchaPort({ secretKey: 'test-secret', minimumScore: 0.5 });
    const result = await port.verify('token');

    expect(result.passed).toBe(false);
  });

  test('returns passed=false on fetch error', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('network error'))) as unknown as typeof fetch;

    const port = new RecaptchaCaptchaPort({ secretKey: 'test-secret', minimumScore: 0.5 });
    const result = await port.verify('token');

    expect(result.passed).toBe(false);
  });

  test('sends correct POST body and supports custom apiUrl', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    globalThis.fetch = mock((url, init) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body);
      return Promise.resolve(new Response(JSON.stringify({ success: true, score: 0.8 }), { status: 200 }));
    }) as unknown as typeof fetch;

    const port = new RecaptchaCaptchaPort({
      secretKey: 'my-secret',
      minimumScore: 0.5,
      apiUrl: 'https://recaptcha.net/recaptcha/api/siteverify',
    });
    await port.verify('my-token');

    expect(capturedUrl).toBe('https://recaptcha.net/recaptcha/api/siteverify');
    expect(capturedBody).toContain('secret=my-secret');
    expect(capturedBody).toContain('response=my-token');
  });
});
