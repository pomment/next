# AGENTS.md

## Project Intent

Pomment Next is a TypeScript rewrite of Pomment. The current goal is to prove a clean split between:

- Core business logic
- Runtime adapters
- Runtime entries

The current MVP targets Bun with SQLite. Cloudflare Worker, Node.js, auth, mail, reCAPTCHA, push, cache, and legacy data migration are intentionally deferred.

## Architecture Boundaries

### `src/core`

Core must remain runtime-agnostic and WinterCG-friendly.

Allowed in Core:

- ECMAScript and TypeScript language features
- Web-standard APIs such as `URL`, `TextEncoder`, `TextDecoder`, `crypto.randomUUID`, `crypto.getRandomValues`, and `crypto.subtle`
- Pure TypeScript helpers, including compatibility algorithms such as MD5
- Ports/interfaces for external capabilities

Forbidden in Core:

- `bun:*`
- `node:*`
- `Buffer`
- `process.env`
- filesystem access
- SQLite/D1/KV-specific APIs
- HTTP `Request`/`Response`
- `Bun.serve`
- framework/router concerns

Core owns Pomment behavior and compatibility rules:

- Preserve legacy JSON field names such as `emailHashed`, `origContent`, `receiveEmail`, `editKey`, `createdAt`, and `updatedAt`.
- Public post output must not expose private fields such as `email`, `editKey`, `receiveEmail`, or `origContent`.
- `Thread.amount` counts only non-hidden posts.
- New user posts are hidden only when `moderationInitiallyHidden` is enabled.
- Website URLs must be cleared unless they start with `http://` or `https://`.
- Default avatar hash behavior is legacy-compatible MD5. SHA-256 is configurable.

### `src/runtime-bun`

Runtime Bun may use Bun-specific APIs.

Current responsibilities:

- `bun:sqlite` storage adapter
- SQLite schema bootstrap
- row/domain mapping
- storage transactions

Do not put HTTP routing or request parsing here. That belongs in `src/entry-bun`.

### `src/entry-bun`

Entry Bun may use `Bun.serve`, HTTP `Request`/`Response`, route matching, body parsing, and response formatting.

Keep legacy API compatibility where practical:

- Return JSON envelopes shaped as `{ "code": number, "data": unknown }`.
- Preserve the existing public/admin route shapes listed in `README.md`.
- Admin routes are intentionally unauthenticated for the first MVP. Do not treat this as production-ready.

## Development Rules

- Prefer small, direct changes over new abstraction layers.
- Do not resurrect or copy code from the old `next/` experiment in the original Pomment repository.
- Use the Go implementation as behavioral reference when legacy behavior matters.
- Do not add backward-compatibility code unless it preserves existing Pomment API/data behavior or is explicitly requested.
- Do not introduce npm workspace/package publishing structure until the runtime boundaries settle.
- Keep new code ASCII unless an existing file already requires non-ASCII.
- Keep comments rare and focused on why a constraint exists, not what the code is doing.

## Verification

Run before committing meaningful code changes:

```sh
bun test
bun run typecheck
```

For HTTP entry changes, also smoke test the server:

```sh
PORT=18080 POMMENT_DB=/tmp/pomment-next-smoke.db bun run src/entry-bun/server.ts
curl -fsS http://127.0.0.1:18080/health
```

Expected health response:

```json
{"code":200,"data":null}
```

## Git Hygiene

- Do not commit `node_modules`, SQLite database files, `.env`, or local logs.
- `bun.lock` is intentionally committed.
- Run `git status --short --branch` before committing.
- Inspect staged changes before committing.

## Deferred Work

Do not implement these unless explicitly requested:

- legacy JSON data migration
- Cloudflare Worker adapter
- Node.js adapter
- admin authentication
- email notifications
- reCAPTCHA
- FCM push
- cache adapter
