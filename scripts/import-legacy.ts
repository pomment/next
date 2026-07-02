import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LEGACY_DATA_PATH = process.env.LEGACY_DATA_PATH ?? '/Users/tcdw/Projects/Self/next/apps/SilverBlog/plugins/pomment';
const POMMENT_HOST = process.env.POMMENT_HOST ?? '127.0.0.1';
const POMMENT_PORT = process.env.POMMENT_PORT ?? '18080';

interface LegacyMeta {
  title: string;
  firstPostAt: number;
  latestPostAt: number;
  amount: number;
  id: string;
  locked: boolean;
  url: string;
}

interface LegacyPost {
  id: string;
  name: string;
  email: string;
  emailHashed: string;
  website: string;
  avatar: string;
  parent: string;
  content: string;
  origContent?: string;
  hidden: boolean;
  rating: number;
  byAdmin: boolean;
  receiveEmail: boolean;
  editKey: string;
  createdAt: number;
  updatedAt: number;
}

interface IndexEntry {
  id: string;
  url: string;
}

async function importThread(meta: LegacyMeta, posts: LegacyPost[]): Promise<void> {
  const body = {
    thread: {
      url: meta.url,
      title: meta.title,
      firstPostAt: meta.firstPostAt,
      latestPostAt: meta.latestPostAt,
      amount: meta.amount,
      locked: meta.locked,
    },
    posts: posts.map(p => ({
      name: p.name,
      email: p.email,
      emailHashed: p.emailHashed,
      website: p.website || undefined,
      avatar: p.avatar || undefined,
      parent: p.parent ? Number(p.parent) || undefined : undefined,
      content: p.content,
      origContent: p.origContent || undefined,
      hidden: p.hidden,
      rating: p.rating,
      byAdmin: p.byAdmin,
      receiveEmail: p.receiveEmail,
      editKey: p.editKey || undefined,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  };

  const response = await fetch(`http://${POMMENT_HOST}:${POMMENT_PORT}/admin/thread/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
}

async function main(): Promise<void> {
  const indexPath = join(LEGACY_DATA_PATH, 'index.json');
  const indexData = await readFile(indexPath, 'utf-8');
  const index: IndexEntry[] = JSON.parse(indexData);

  console.log(`Found ${index.length} threads to import`);

  let success = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const entry of index) {
    const threadsDir = join(LEGACY_DATA_PATH, 'threads');
    const metaPath = join(threadsDir, `${entry.id}.meta.json`);
    const postsPath = join(threadsDir, `${entry.id}.json`);

    try {
      const metaRaw = await readFile(metaPath, 'utf-8');
      const postsRaw = await readFile(postsPath, 'utf-8');

      const meta: LegacyMeta = JSON.parse(metaRaw);
      const posts: LegacyPost[] = JSON.parse(postsRaw);

      await importThread(meta, posts);
      success++;
      console.log(`  ✓ ${entry.id} (${meta.url}) — ${posts.length} posts`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ id: entry.id, error: message });
      console.error(`  ✗ ${entry.id} — ${message}`);
    }
  }

  console.log(`\nImport complete: ${success} succeeded, ${failed} failed`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const { id, error } of errors) {
      console.log(`  ${id}: ${error}`);
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
