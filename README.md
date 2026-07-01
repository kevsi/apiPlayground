# reqly

API testing platform. Web UI, desktop app, CLI runner, MCP server, optional workspace sync.

## Workspace

```
reqy-web/       Next.js 16 web app (React 19, TypeScript 5.7)
reqy-cli/       Headless collection runner (commander)
reqy-mcp/       MCP server — exposes collections to AI agents
sync-server/    Hono + better-sqlite3 workspace sync backend
src-tauri/      Rust desktop shell wrapping reqy-web
```

## Quick start

```bash
# Install (pnpm 9, Node ≥ 20)
pnpm install

# Run the web app (http://localhost:3000)
pnpm --dir reqy-web dev

# Build everything
pnpm --dir reqy-web build
pnpm --dir sync-server build

# Optional: run the sync server (port 4000)
AUTH_SIGNING_SECRET=$(openssl rand -hex 32) pnpm --dir sync-server dev
```

## Build & test

| Command | Purpose |
|---|---|
| `pnpm --dir reqy-web dev` | Dev server (Turbopack) |
| `pnpm --dir reqy-web build` | Production build |
| `pnpm --dir reqy-web test` | Vitest unit tests |
| `pnpm --dir reqy-web test:e2e` | Playwright E2E |
| `pnpm --dir reqy-web lint` | ESLint |
| `pnpm --dir sync-server build` | Compile sync-server (Node.js) |
| `pnpm --dir reqy-cli build` | Compile CLI |
| `pnpm tauri:dev` | Run desktop app (dev) |
| `pnpm tauri:build` | Build desktop app |

## Environment

Copy `.env.example` to `reqy-web/.env.local`. All variables are optional
except those you actually need (auth is currently disabled — see
`reqy-web/middleware.ts`).

| Variable | Required when | Purpose |
|---|---|---|
| `AUTH_SIGNING_SECRET` | Future auth re-enable | HMAC session cookie secret |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase OAuth | OAuth provider (currently unused) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server-side calls | (currently unused) |
| `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` | GitHub OAuth flow | Repo import |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | Google OAuth | (configured, not wired) |
| `NEXT_PUBLIC_SYNC_URL` | Sync server usage | URL of sync-server |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Distributed rate limit | Falls back to in-memory if unset |
| `ALLOW_LOCAL_HOSTS` | Local dev against private APIs | Allows 127.0.0.1 / 10.* / etc. |

## Layout

```
reqy-web/
  app/                  Next.js App Router (web UI + API routes)
  components/           React components
  hooks/                Zustand stores + React hooks
  lib/                  Pure logic (SSRF, mock, tests, postman, tree-sitter)
  tests/e2e/            Playwright specs
src-tauri/              Rust + WebView
sync-server/src/        Hono routes (workspaces, memberships, sync)
reqy-cli/src/           CLI runner (commander-based)
reqy-mcp/src/           MCP server (stdio transport)
```

## Status

Latest tag: `v0.2.0-security-hardening` — SSRF hardening, distributed rate
limiter, streaming proxy response, lazy tree-sitter, postman module merged,
sync-server Hono migration. Auth gate is disabled (Supabase non-functional);
the HMAC session parser is preserved in `reqy-web/lib/session.ts` for
future re-enablement.
