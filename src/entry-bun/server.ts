import { PommentCore } from '../core';
import { BunSqliteStorage } from '../runtime-bun';
import { createHandler } from './routes';

const port = Number(Bun.env.PORT ?? 8080);
const databasePath = Bun.env.POMMENT_DB ?? 'pomment.db';

const storage = new BunSqliteStorage({ filename: databasePath });
const core = new PommentCore({ storage });
const handler = createHandler(core);

Bun.serve({
  port,
  fetch: handler,
});

console.log(`Pomment Bun server listening on http://localhost:${port}`);
