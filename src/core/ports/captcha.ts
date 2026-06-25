export interface CaptchaPort {
  verify(response: string): Promise<{ passed: boolean; score?: number }>;
}

export class NoopCaptchaPort implements CaptchaPort {
  async verify(): Promise<{ passed: boolean }> {
    return { passed: true };
  }
}
