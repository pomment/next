import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PommentCore } from '../src/core/index';
import { createHandler } from '../src/entry-bun/routes';
import { BunSqliteStorage } from '../src/runtime-bun/index';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'pomment-next-smoke-'));
  const dbPath = join(dir, 'pomment.db');

  const storage = new BunSqliteStorage({ filename: dbPath });
  const core = new PommentCore({ storage });
  const handler = createHandler(core);

  let passed = 0;

  async function scenario(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (error) {
      console.error(`  ❌ ${name}`);
      console.error(`     ${(error as Error).message}`);
      throw error;
    }
  }

  const base = 'http://localhost';

  function req(method: string, path: string, body?: unknown): Request {
    return new Request(`${base}${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  try {
    console.log('Pomment Next smoke test\n');

    await scenario('GET /health returns 200', async () => {
      const res = await handler(req('GET', '/health'));
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const json = (await res.json()) as { code: number; data: unknown };
      assert(json.code === 200, `expected code 200, got ${json.code}`);
      assert(json.data === null, 'expected data to be null');
    });

    let threadId = 0;
    let postId = 0;

    await scenario('POST /public/posts/add creates thread and post', async () => {
      const res = await handler(
        req('POST', '/public/posts/add', {
          url: 'https://example.com/smoke',
          title: 'Smoke Test Post',
          name: 'Alice',
          email: 'alice@example.com',
          website: 'javascript:alert(1)',
          content: 'hello smoke',
          receiveEmail: true,
        }),
      );
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const json = (await res.json()) as { code: number; data: any };
      assert(json.code === 200, `expected code 200, got ${json.code}`);
      assert(json.data.website === '', `expected empty website, got "${json.data.website}"`);
      assert(json.data.emailHashed.length > 0, 'expected emailHashed to be set');
      assert(json.data.origContent === 'hello smoke', 'expected origContent to be set');
      assert(typeof json.data.editKey === 'string' && json.data.editKey.length > 0, 'expected editKey');
      threadId = json.data.id;
      postId = json.data.id;
    });

    await scenario('POST /public/posts/add discovers existing thread', async () => {
      const res = await handler(
        req('POST', '/public/posts/add', {
          url: 'https://example.com/smoke',
          title: 'Should Not Update',
          name: 'Bob',
          email: 'bob@example.com',
          content: 'second comment on same thread',
        }),
      );
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const json = (await res.json()) as { code: number; data: any };
      assert(json.code === 200, `expected code 200, got ${json.code}`);
    });

    await scenario('get thread ID via public posts endpoint', async () => {
      const listRes = await handler(req('POST', '/public/posts/byUrl', { url: 'https://example.com/smoke' }));
      assert(listRes.status === 200, `expected 200, got ${listRes.status}`);
      const listJson = (await listRes.json()) as { code: number; data: any };
      assert(listJson.code === 200, `expected code 200, got ${listJson.code}`);
      threadId = listJson.data.meta.id;
      assert(threadId > 0, 'expected threadId to be set');
    });

    await scenario('GET /public/posts/:id hides private fields and counts correctly', async () => {
      const res = await handler(req('GET', `/public/posts/${threadId}`));
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const json = (await res.json()) as { code: number; data: any };
      assert(json.code === 200, `expected code 200, got ${json.code}`);
      assert(json.data.meta.amount === 2, `expected amount 2, got ${json.data.meta.amount}`);
      assert(json.data.post.length === 2, `expected 2 posts, got ${json.data.post.length}`);
      for (const post of json.data.post) {
        assert(!('email' in post), 'public post should not expose email');
        assert(!('editKey' in post), 'public post should not expose editKey');
        assert(!('receiveEmail' in post), 'public post should not expose receiveEmail');
        assert(!('origContent' in post), 'public post should not expose origContent');
      }
    });

    await scenario('POST /admin/posts/:threadId creates admin post', async () => {
      const res = await handler(
        req('POST', `/admin/posts/${threadId}`, {
          name: 'Admin',
          email: 'admin@example.com',
          content: 'admin reply',
        }),
      );
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const json = (await res.json()) as { code: number; data: any };
      assert(json.data.byAdmin === true, 'expected byAdmin to be true');
      assert(json.data.hidden === false, 'expected hidden to be false');
    });

    await scenario('GET /admin/thread/:id returns all posts with private fields', async () => {
      const res = await handler(req('GET', `/admin/thread/${threadId}`));
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const json = (await res.json()) as { code: number; data: any[] };
      assert(json.data.length === 3, `expected 3 posts, got ${json.data.length}`);
      const adminPost = json.data.find(p => p.content === 'admin reply');
      assert(adminPost, 'expected to find admin post');
      assert(typeof adminPost.email === 'string', 'admin route should expose email');
    });

    let editedPostUpdatedAt = 0;

    await scenario('PUT /admin/posts/:threadId edits a post', async () => {
      const getRes = await handler(req('GET', `/admin/posts/${threadId}/${postId}`));
      assert(getRes.status === 200, `expected 200, got ${getRes.status}`);
      const getJson = (await getRes.json()) as { code: number; data: any };
      const original = getJson.data;
      const originalUpdatedAt = original.updatedAt;

      const putRes = await handler(
        req('PUT', `/admin/posts/${threadId}`, {
          ...original,
          content: 'edited content',
          alterEditTime: true,
        }),
      );
      assert(putRes.status === 200, `expected 200, got ${putRes.status}`);
      const putJson = (await putRes.json()) as { code: number; data: any };
      assert(putJson.data.content === 'edited content', 'content should be updated');
      assert(putJson.data.updatedAt >= originalUpdatedAt, 'updatedAt should not decrease');
      editedPostUpdatedAt = putJson.data.updatedAt;
    });

    await scenario('POST /public/posts/add with missing fields returns 400', async () => {
      const res = await handler(
        req('POST', '/public/posts/add', {
          url: 'https://example.com/bad',
          // missing title, name, email, content
        }),
      );
      assert(res.status === 400, `expected 400, got ${res.status}`);
      const json = (await res.json()) as { code: number; data: unknown };
      assert(json.code === 400, `expected code 400, got ${json.code}`);
      assert(json.data === null, 'expected data to be null on error');
    });

    await scenario('GET /admin/posts/:t/:p for non-existent post returns 404', async () => {
      const res = await handler(req('GET', `/admin/posts/${threadId}/does-not-exist`));
      assert(res.status === 404, `expected 404, got ${res.status}`);
      const json = (await res.json()) as { code: number; data: unknown };
      assert(json.code === 404, `expected code 404, got ${json.code}`);
    });

    await scenario('POST /admin/thread/refresh updates meta correctly', async () => {
      const res = await handler(req('POST', '/admin/thread/refresh'));
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const json = (await res.json()) as { code: number; data: unknown };
      assert(json.code === 200, `expected code 200, got ${json.code}`);

      const metaRes = await handler(req('GET', `/admin/thread/meta/${threadId}`));
      const metaJson = (await metaRes.json()) as { code: number; data: any };
      assert(metaJson.data.amount === 3, `expected amount 3, got ${metaJson.data.amount}`);
      assert(metaJson.data.firstPostAt > 0, 'expected firstPostAt to be set');
      assert(metaJson.data.latestPostAt >= metaJson.data.firstPostAt, 'latestPostAt should be >= firstPostAt');
    });

    await scenario('thread meta by URL endpoints work', async () => {
      const byUrlRes = await handler(req('POST', '/public/thread/meta/byUrl', { url: 'https://example.com/smoke' }));
      const byUrlJson = (await byUrlRes.json()) as { code: number; data: any };
      assert(byUrlJson.data.id === threadId, 'byUrl should return correct thread');

      const byUrlsRes = await handler(req('POST', '/public/thread/meta/byUrls', ['https://example.com/smoke']));
      const byUrlsJson = (await byUrlsRes.json()) as { code: number; data: any };
      assert(byUrlsJson.data['https://example.com/smoke']?.id === threadId, 'byUrls should return correct thread');
    });

    await scenario('POST /robots.txt returns plain text', async () => {
      const res = await handler(req('GET', '/robots.txt'));
      assert(res.status === 200, `expected 200, got ${res.status}`);
      assert(res.headers.get('content-type')?.includes('text/plain'), 'expected text/plain content type');
      const text = await res.text();
      assert(text.includes('User-Agent: *'), 'expected robots.txt content');
    });

    await scenario('unknown route returns 404', async () => {
      const res = await handler(req('GET', '/this/does/not/exist'));
      assert(res.status === 404, `expected 404, got ${res.status}`);
    });

    console.log(`\n${passed} scenarios passed`);
  } catch {
    console.error(`\nsmoke test failed at scenario ${passed + 1}`);
    storage.close();
    rmSync(dir, { recursive: true, force: true });
    process.exit(1);
  }

  storage.close();
  rmSync(dir, { recursive: true, force: true });
  console.log('\n✅ smoke test passed');
}

main();
