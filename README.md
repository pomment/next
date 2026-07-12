# Pomment Next

Experimental TypeScript rewrite of Pomment.

## Shape

- `src/core`: runtime-agnostic business logic. It does not import `bun:*`, `node:*`, SQLite, HTTP `Request`/`Response`, or environment variables.
- `src/runtime-bun`: Bun-specific runtime adapters. The current adapter uses `bun:sqlite`.
- `src/entry-bun`: Bun HTTP entry powered by `Bun.serve`.

Admin routes use a single deployment-managed administrator password and opaque server-side sessions.

## Scripts

```sh
bun install
bun run build
bun run start
bun test
bun run typecheck
bunx playwright install chromium
bun run test:admin-e2e
bun run dev
bun run auth:hash-password
bun run backup
```

The admin UI is the `admin-ui` package in the Bun workspace:

```sh
bun install
bun run admin:dev
```

During development, Vite proxies `/api` requests to the Bun entry at `http://127.0.0.1:8080` and supplies the trusted loopback client IP header. Run `bun run admin:build` before production startup; the Bun entry serves the built SPA at `/admin` and warns without disabling APIs when the build is missing.

For a production Bun deployment managed by systemd, see [`DEPLOYMENT.md`](DEPLOYMENT.md).

The Bun entry listens on loopback using `PORT` or `8080`, and stores data in `POMMENT_DB` or `pomment.db`. Put nginx or Caddy in front of it and overwrite `X-Real-IP` with the connecting client address. Cloudflare Tunnel's `CF-Connecting-IP` header is also supported. Forwarded client headers are accepted only from a loopback peer; do not share that loopback network namespace with untrusted workloads.

Set `POMMENT_CORS_ORIGINS` to a comma-separated list of exact HTTP origins when websites on other origins need browser access to the public API. For example, `POMMENT_CORS_ORIGINS='https://blog.example.com,https://www.example.com'`. Paths, trailing slashes, and wildcard origins are not accepted. CORS applies only to `/api/public/*`; admin routes continue to use `POMMENT_ADMIN_ORIGIN`.

## Admin Authentication

Generate an Argon2id password hash interactively:

```sh
bun run auth:hash-password
```

Configure the Bun entry with:

- `POMMENT_ADMIN_PASSWORD_HASH`: the quoted PHC string emitted by the hash command.
- `POMMENT_ADMIN_ORIGIN`: the exact admin UI origin, such as `https://comments.example.com`, without a trailing slash.
- `POMMENT_SESSION_STORE`: explicitly set to `redis` or `memory`. Use `memory` only for local development and tests.
- `POMMENT_REDIS_URL`: required when the session store is `redis`.
- `POMMENT_AUTH_INSECURE_COOKIE=true`: local HTTP development only. Production cookies are Secure by default.

For local UI development:

```sh
POMMENT_ADMIN_PASSWORD_HASH='$argon2id$...' \
POMMENT_ADMIN_ORIGIN='http://localhost:5173' \
POMMENT_SESSION_STORE=memory \
POMMENT_AUTH_INSECURE_COOKIE=true \
bun run dev
```

Missing or invalid auth configuration fails closed with HTTP 503 for admin routes while public routes remain available. Redis failures also return 503 without clearing existing browser cookies.

## Backup And Restore

Backups contain all persisted thread and post fields, including private email and edit-key data. The `.jsonl.gz` file is checksummed but not encrypted; protect it as sensitive data.

```sh
bun run backup export --db pomment.db --output backup.jsonl.gz
bun run backup verify backup.jsonl.gz
bun run backup import --url https://comments.example.com backup.jsonl.gz
bun run backup abort --url https://comments.example.com
```

Export reads a consistent SQLite snapshot in a single transaction and streams canonical JSONL through gzip. The output path is overwritten directly and must not be the database path. Import verifies the complete file locally before logging in, uploads authenticated resumable batches to an empty target, and verifies the restored data again before completion. Public and admin data routes return HTTP 503 while an import is incomplete; authentication, health, and backup routes remain available. Plain HTTP targets require the explicit `--insecure` flag.

## Implemented Routes

- `GET /api/health`
- `GET /robots.txt`
- `GET /api/public/thread/meta/:id`
- `POST /api/public/thread/meta/byUrl`
- `POST /api/public/thread/meta/byUrls`
- `GET /api/public/posts/:id`
- `POST /api/public/posts/byUrl`
- `POST /api/public/posts/add`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/health`
- `GET /api/admin/backup/import`
- `POST /api/admin/backup/import`
- `PUT /api/admin/backup/import/:id/batches/:sequence`
- `POST /api/admin/backup/import/:id/complete`
- `DELETE /api/admin/backup/import/:id`
- `GET /api/admin/thread/list`
- `GET /api/admin/thread/:id`
- `POST /api/admin/thread/refresh`
- `GET /api/admin/thread/meta/:id`
- `PUT /api/admin/thread/meta`
- `GET /api/admin/posts/:threadId/:postId`
- `POST /api/admin/posts/:id`
- `PUT /api/admin/posts/:id`

All admin routes except `POST /api/admin/login` require the HttpOnly admin session cookie. Unsafe admin requests must come from `POMMENT_ADMIN_ORIGIN`.

## Deferred

- Existing JSON data migration
- Cloudflare Worker adapter
- Node.js adapter
- Email notifications
- reCAPTCHA
- FCM push
- Cache adapter
