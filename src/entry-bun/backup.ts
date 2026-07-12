import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import type {
  ApiResponse,
} from './responses';
import type {
  BackupImportSession,
  CompleteBackupImportResult,
  StartBackupImportResult,
} from '../core';
import { exportBunSqliteBackup, scanBunBackup } from '../runtime-bun';

const [command, ...args] = Bun.argv.slice(2);

try {
  switch (command) {
    case 'export': await exportCommand(args); break;
    case 'verify': await verifyCommand(args); break;
    case 'import': await importCommand(args); break;
    case 'abort': await abortCommand(args); break;
    default: throw new Error(usage());
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Backup command failed');
  process.exitCode = 1;
}

async function exportCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args, ['db', 'output']);
  const databasePath = requiredOption(parsed, 'db');
  const outputPath = requiredOption(parsed, 'output');
  if (parsed.positionals.length !== 0) throw new Error(usage());
  const packageJson = await Bun.file(new URL('../../package.json', import.meta.url)).json() as { version: string };
  const result = await exportBunSqliteBackup({ databasePath, outputPath, generatorVersion: packageJson.version });
  console.log(JSON.stringify({ outputPath, manifest: result.manifest, trailer: result.trailer }, null, 2));
}

async function verifyCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args, []);
  if (parsed.positionals.length !== 1) throw new Error(usage());
  const result = await scanBunBackup(parsed.positionals[0]);
  printWarnings(result.warnings);
  console.log(JSON.stringify({ manifest: result.manifest, trailer: result.trailer }, null, 2));
}

async function importCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args, ['url'], ['insecure']);
  if (parsed.positionals.length !== 1) throw new Error(usage());
  const path = parsed.positionals[0];
  const target = targetUrl(requiredOption(parsed, 'url'), parsed.flags.has('insecure'));
  const verified = await scanBunBackup(path);
  printWarnings(verified.warnings);

  const cookie = await login(target);
  const session = await api<StartBackupImportResult>(target, cookie, '/api/admin/backup/import', {
    method: 'POST',
    body: JSON.stringify({ manifest: verified.manifest, sha256: verified.trailer.sha256 }),
    headers: { 'content-type': 'application/json' },
  });
  if (session.status === 'complete') {
    console.log(JSON.stringify({ status: 'complete', importId: session.id }));
    return;
  }

  let sequence = 0;
  let lines: string[] = [];
  let bytes = 0;
  const flush = async (): Promise<void> => {
    if (lines.length === 0) return;
    const body = new TextEncoder().encode(`${lines.join('\n')}\n`);
    if (sequence >= session.nextSequence) {
      const digest = createHash('sha256').update(body).digest('hex');
      await api(target, cookie, `/api/admin/backup/import/${session.id}/batches/${sequence}`, {
        method: 'PUT',
        body,
        headers: {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'x-pomment-batch-sha256': digest,
        },
      });
      process.stderr.write(`Uploaded batch ${sequence + 1}\n`);
    }
    sequence++;
    lines = [];
    bytes = 0;
  };

  await scanBunBackup(path, {
    onDataRecord: async (_record, line) => {
      const lineBytes = Buffer.byteLength(line, 'utf8') + 1;
      if (lineBytes > session.maxRecordBytes) throw new Error('Backup contains a record larger than the target limit');
      if (lines.length > 0 && (lines.length >= session.maxRecordsPerBatch || bytes + lineBytes > session.maxBytesPerBatch)) {
        await flush();
      }
      lines.push(line);
      bytes += lineBytes;
    },
  });
  await flush();

  const completed = await api<CompleteBackupImportResult>(
    target,
    cookie,
    `/api/admin/backup/import/${session.id}/complete`,
    { method: 'POST' },
  );
  printWarnings(completed.warnings);
  console.log(JSON.stringify(completed, null, 2));
}

async function abortCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args, ['url'], ['insecure']);
  if (parsed.positionals.length !== 0) throw new Error(usage());
  const target = targetUrl(requiredOption(parsed, 'url'), parsed.flags.has('insecure'));
  const cookie = await login(target);
  const session = await api<BackupImportSession | null>(target, cookie, '/api/admin/backup/import');
  if (!session) throw new Error('No backup import is in progress');
  await api(target, cookie, `/api/admin/backup/import/${session.id}`, { method: 'DELETE' });
  console.log(JSON.stringify({ aborted: session.id }));
}

interface ParsedArgs {
  options: Map<string, string>;
  flags: Set<string>;
  positionals: string[];
}

function parseArgs(args: string[], optionNames: string[], flagNames: string[] = []): ParsedArgs {
  const options = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (flagNames.includes(name)) {
      flags.add(name);
      continue;
    }
    if (!optionNames.includes(name) || index + 1 >= args.length || args[index + 1].startsWith('--')) throw new Error(usage());
    options.set(name, args[++index]);
  }
  return { options, flags, positionals };
}

function requiredOption(parsed: ParsedArgs, name: string): string {
  const value = parsed.options.get(name);
  if (!value) throw new Error(`Missing --${name}\n\n${usage()}`);
  return value;
}

function targetUrl(value: string, insecure: boolean): URL {
  const url = new URL(value);
  if (url.origin !== value.replace(/\/$/, '') || url.pathname !== '/') throw new Error('--url must be an exact origin without a path');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && insecure)) {
    throw new Error('HTTP targets require --insecure');
  }
  return url;
}

async function login(target: URL): Promise<string> {
  const password = await readPassword();
  const response = await fetch(new URL('/api/admin/login', target), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: target.origin },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error(`Admin login failed with HTTP ${response.status}`);
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Admin login did not return a session cookie');
  return cookie;
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('Password input requires an interactive terminal');
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const readline = createInterface({ input: process.stdin, output: muted, terminal: true });
  try {
    process.stderr.write('Admin password: ');
    const password = await readline.question('');
    process.stderr.write('\n');
    return password;
  } finally {
    readline.close();
  }
}

async function api<T>(target: URL, cookie: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('cookie', cookie);
  headers.set('origin', target.origin);
  const response = await fetch(new URL(path, target), { ...init, headers });
  let envelope: ApiResponse<T> | undefined;
  try {
    envelope = await response.json() as ApiResponse<T>;
  } catch {
    throw new Error(`Backup API returned invalid JSON with HTTP ${response.status}`);
  }
  if (!response.ok || envelope.code !== 200) throw new Error(`Backup API failed with HTTP ${response.status}`);
  return envelope.data;
}

function printWarnings(warnings: Array<{ type: string; count: number; threadIds: number[] }>): void {
  for (const warning of warnings) {
    console.error(`Warning: ${warning.type} mismatch in ${warning.count} thread(s); examples: ${warning.threadIds.join(', ')}`);
  }
}

function usage(): string {
  return `Usage:
  bun run backup export --db <database> --output <backup.jsonl.gz>
  bun run backup verify <backup.jsonl.gz>
  bun run backup import --url <origin> [--insecure] <backup.jsonl.gz>
  bun run backup abort --url <origin> [--insecure]`;
}
