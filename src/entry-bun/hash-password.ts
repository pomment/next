import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { adminPasswordByteLength, normalizeAdminPassword } from '../core';

if (!process.stdin.isTTY) {
  console.error('Password input requires an interactive terminal');
  process.exit(1);
}

const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
const readline = createInterface({ input: process.stdin, output: muted, terminal: true });

try {
  const password = normalizeAdminPassword(await hiddenQuestion('Admin password: '));
  if (Array.from(password).length < 8) {
    throw new Error('Password must contain at least 8 characters');
  }
  if (adminPasswordByteLength(password) > 1024) {
    throw new Error('Password must not exceed 1024 UTF-8 bytes');
  }
  const confirmation = normalizeAdminPassword(await hiddenQuestion('Confirm password: '));
  if (password !== confirmation) {
    throw new Error('Passwords do not match');
  }

  const hash = await Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 65536,
    timeCost: 2,
  });
  process.stdout.write(`${hash}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unable to hash password');
  process.exitCode = 1;
} finally {
  readline.close();
}

async function hiddenQuestion(prompt: string): Promise<string> {
  process.stderr.write(prompt);
  const answer = await readline.question('');
  process.stderr.write('\n');
  return answer;
}
