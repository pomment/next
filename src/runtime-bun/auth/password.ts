import type { AdminPasswordVerifier } from '../../core';

const ARGON2ID_HASH = /^\$argon2id\$v=19\$m=65536,t=2,p=1\$[^$]+\$[^$]+$/;

export class BunAdminPasswordVerifier implements AdminPasswordVerifier {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly hash: string) {
    if (!ARGON2ID_HASH.test(hash)) {
      throw new Error('admin password hash must use Argon2id m=65536,t=2,p=1');
    }
  }

  async verify(password: string): Promise<boolean> {
    await this.acquire();
    try {
      return await Bun.password.verify(password, this.hash);
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < 2) {
      this.active++;
      return;
    }
    await new Promise<void>(resolve => this.waiters.push(resolve));
    this.active++;
  }

  private release(): void {
    this.active--;
    this.waiters.shift()?.();
  }
}
