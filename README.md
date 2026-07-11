# Pomment Next

Experimental TypeScript rewrite of Pomment.

## Shape

- `src/core`: runtime-agnostic business logic. It does not import `bun:*`, `node:*`, SQLite, HTTP `Request`/`Response`, or environment variables.
- `src/runtime-bun`: Bun-specific runtime adapters. The current adapter uses `bun:sqlite`.
- `src/entry-bun`: Bun HTTP entry powered by `Bun.serve`.

The first MVP keeps admin routes unauthenticated by design.

## Scripts

```sh
bun install
bun test
bun run typecheck
bun run dev
```

The temporary admin UI is the `admin-ui-temp` package in the Bun workspace:

```sh
bun install
bun run admin:dev
```

During development, Vite proxies `/admin` API requests to the Bun entry at `http://localhost:8080`.

The Bun entry listens on `PORT` or `8080`, and stores data in `POMMENT_DB` or `pomment.db`.

## Implemented Routes

- `GET /health`
- `GET /robots.txt`
- `GET /public/thread/meta/:id`
- `POST /public/thread/meta/byUrl`
- `POST /public/thread/meta/byUrls`
- `GET /public/posts/:id`
- `POST /public/posts/byUrl`
- `POST /public/posts/add`
- `GET /admin/thread/list`
- `GET /admin/thread/:id`
- `POST /admin/thread/refresh`
- `GET /admin/thread/meta/:id`
- `PUT /admin/thread/meta`
- `GET /admin/posts/:threadId/:postId`
- `POST /admin/posts/:id`
- `PUT /admin/posts/:id`

Admin routes are intentionally unauthenticated for the first MVP. Do not expose this entry publicly yet.

## Deferred

- Existing JSON data migration
- Cloudflare Worker adapter
- Node.js adapter
- Admin authentication
- Email notifications
- reCAPTCHA
- FCM push
- Cache adapter
