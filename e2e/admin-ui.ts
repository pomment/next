import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

const password = 'correct horse battery staple';
const passwordHash = '$argon2id$v=19$m=65536,t=2,p=1$tyQOWKNcs1KKzWRKY7mxeybWiZipXV0MCRqTWswH3vI$hc3lPY7HeprGEZNECMxEAXlCG1g8+XD1jrb/lVeBYno';
const port = 18000 + Math.floor(Math.random() * 10000);
const origin = `http://127.0.0.1:${port}`;
const directory = mkdtempSync(join(tmpdir(), 'pomment-admin-e2e-'));
const server = Bun.spawn(['bun', 'run', 'src/entry-bun/server.ts'], {
  cwd: join(import.meta.dir, '..'),
  env: {
    ...process.env,
    PORT: String(port),
    POMMENT_DB: join(directory, 'pomment.db'),
    POMMENT_ADMIN_PASSWORD_HASH: passwordHash,
    POMMENT_ADMIN_ORIGIN: origin,
    POMMENT_SESSION_STORE: 'memory',
    POMMENT_AUTH_INSECURE_COOKIE: 'true',
  },
  stdout: 'pipe',
  stderr: 'pipe',
});

let browser: Browser | undefined;
const pageErrors: Error[] = [];

try {
  await waitForServer();
  const removedAdminAlias = await fetch(`${origin}/admin/health`);
  if (removedAdminAlias.status !== 404) throw new Error(`old admin API alias returned ${removedAdminAlias.status}`);
  const first = await api<{ id: number }>('/api/public/posts/add', {
    method: 'POST',
    body: JSON.stringify({
      url: 'https://example.com/e2e',
      title: 'E2E Thread',
      name: 'Alice',
      email: 'alice@example.com',
      content: 'First comment',
    }),
  });
  await api('/api/public/posts/add', {
    method: 'POST',
    body: JSON.stringify({
      url: 'https://example.com/e2e',
      title: 'E2E Thread',
      parent: first.id,
      name: 'Bob',
      email: 'bob@example.com',
      content: 'Child comment',
    }),
  });
  const thread = await api<{ id: number }>('/api/public/thread/meta/byUrl', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com/e2e' }),
  });

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: { 'X-Real-IP': '127.0.0.1' },
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error));
  await login(page);

  await page.getByRole('button', { name: '管理员身份' }).click();
  await page.getByPlaceholder('Pomment Admin').fill('E2E Admin');
  await page.getByPlaceholder('admin@example.com').fill('admin@example.com');
  await page.getByRole('button', { name: '保存到本机' }).click();

  await page.getByText('E2E Thread', { exact: true }).first().click();
  await page.getByText('First comment', { exact: true }).waitFor();
  await page.getByRole('button', { name: '回复树' }).click();
  if (!await page.getByRole('button', { name: '回复树' }).evaluate(element => element.classList.contains('active'))) {
    throw new Error('tree view did not become active');
  }

  const firstCard = page.locator('article').filter({ hasText: 'First comment' }).first();
  await firstCard.getByRole('button', { name: '回复', exact: true }).click();
  await page.getByPlaceholder('输入管理员回复...').fill('Admin reply');
  await page.getByRole('button', { name: '发布回复' }).click();
  await page.getByText('Admin reply', { exact: true }).waitFor();

  await firstCard.getByRole('button', { name: '完整编辑' }).click();
  await page.getByRole('heading', { name: '完整编辑评论' }).waitFor();
  const postInputs = page.locator('.form-card input');
  await postInputs.nth(1).fill('alice+edited@example.com');
  await page.locator('.form-card textarea').fill('Edited first comment');
  const updateResponsePromise = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/api/admin/posts/'));
  await page.getByRole('button', { name: '保存修改' }).click();
  const updateResponse = await updateResponsePromise;
  if (!updateResponse.ok()) throw new Error(`post edit failed (${updateResponse.status()}): ${await updateResponse.text()}`);
  await page.waitForURL(new RegExp(`/admin/threads/${thread.id}$`));
  await page.getByText('Edited first comment', { exact: true }).waitFor();

  const editedCard = page.locator('article').filter({ hasText: 'Edited first comment' }).first();
  await editedCard.locator('.t-switch').click();
  await editedCard.getByText('已隐藏', { exact: true }).first().waitFor();

  await page.getByRole('button', { name: '编辑元数据' }).click();
  const threadInputs = page.locator('.form-card input');
  await threadInputs.nth(0).fill('Locked E2E Thread');
  await page.locator('.locked-row .t-switch').click();
  await page.getByRole('button', { name: '保存元数据' }).click();
  await page.getByRole('heading', { name: 'Locked E2E Thread' }).waitFor();

  await page.goto(`${origin}/admin/threads/${thread.id}`);
  await page.reload();
  await page.getByRole('heading', { name: 'Locked E2E Thread' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByText('Edited first comment', { exact: true }).waitFor();
  const overflow = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('*'))
    .filter(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.right > window.innerWidth + 1 || bounds.left < -1;
    })
    .slice(0, 8)
    .map(element => `${element.tagName.toLowerCase()}.${element.className}`));
  if (overflow.length) throw new Error(`admin thread page overflows the mobile viewport: ${overflow.join(', ')}`);

  const lockedPost = await fetch(`${origin}/api/public/posts/add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com/e2e',
      title: 'Ignored',
      name: 'Blocked',
      email: 'blocked@example.com',
      content: 'Must not be created',
    }),
  });
  if (lockedPost.status !== 403) throw new Error(`locked thread accepted a public post (${lockedPost.status})`);
  if (pageErrors.length) throw new Error(`browser errors: ${pageErrors.map(error => error.message).join('; ')}`);

  console.log('Admin UI full-stack E2E passed');
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
  rmSync(directory, { recursive: true, force: true });
}

async function login(page: Page): Promise<void> {
  await page.goto(`${origin}/admin`);
  await page.getByPlaceholder('请输入密码').fill(password);
  await page.getByPlaceholder('请输入密码').press('Enter');
  await page.getByRole('heading', { name: '讨论管理' }).waitFor();
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`server exited before becoming ready (${server.exitCode})`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {
      await Bun.sleep(50);
    }
  }
  throw new Error('server did not become ready');
}

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  });
  const payload = await response.json() as { code: number; data: T };
  if (!response.ok || payload.code !== 200) throw new Error(`${path} failed (${response.status})`);
  return payload.data;
}
