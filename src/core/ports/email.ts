export interface EmailPort {
  sendReplyNotification(payload: unknown): Promise<void>;
}

export class NoopEmailPort implements EmailPort {
  async sendReplyNotification(): Promise<void> {}
}
