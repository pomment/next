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
bun test
bun run typecheck
bun run dev
bun run auth:hash-password
```

The temporary admin UI is the `admin-ui-temp` package in the Bun workspace:

```sh
bun install
bun run admin:dev
```

During development, Vite proxies `/admin` API requests to the Bun entry at `http://127.0.0.1:8080` and supplies the trusted loopback client IP header.

The Bun entry listens on loopback using `PORT` or `8080`, and stores data in `POMMENT_DB` or `pomment.db`. Put nginx or Caddy in front of it and overwrite `X-Real-IP` with the connecting client address. Do not share that loopback network namespace with untrusted workloads.

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

## Implemented Routes

- `GET /health`
- `GET /robots.txt`
- `GET /public/thread/meta/:id`
- `POST /public/thread/meta/byUrl`
- `POST /public/thread/meta/byUrls`
- `GET /public/posts/:id`
- `POST /public/posts/byUrl`
- `POST /public/posts/add`
- `POST /admin/login`
- `POST /admin/logout`
- `GET /admin/health`
- `GET /admin/thread/list`
- `GET /admin/thread/:id`
- `POST /admin/thread/refresh`
- `GET /admin/thread/meta/:id`
- `PUT /admin/thread/meta`
- `GET /admin/posts/:threadId/:postId`
- `POST /admin/posts/:id`
- `PUT /admin/posts/:id`

All admin routes except `POST /admin/login` require the HttpOnly admin session cookie. Unsafe admin requests must come from `POMMENT_ADMIN_ORIGIN`.

## Deferred

- Existing JSON data migration
- Cloudflare Worker adapter
- Node.js adapter
- Email notifications
- reCAPTCHA
- FCM push
- Cache adapter
