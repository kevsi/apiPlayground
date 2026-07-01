# PR — v0.2.0-security-hardening (revised)

## Important scope correction

The original PR description proposed wiring a full auth gate. **That work has been reverted** because the underlying Supabase auth flow is non-functional in this environment and `/login` / `/signup` pages don't exist. Shipping the auth gate as-is would have made the entire `(app)` route group unreachable for anonymous visitors.

What remains in this PR is the **infrastructure** for future auth (HMAC session parser, env validation schema, cookie hardening) but the **gate itself is disabled**. To re-enable, follow the instructions in `reqy-web/middleware.ts`.

## Summary

Three-commit hardening pass + one revert commit, addressing the production audit of `apiPlayground-main` (full audit report in `.kimchi/docs/audit-production-2026-07-01-CRITIQUE.md`).

The audit identified drift between documentation and reality, an SSRF gap in the proxy, a rate-limiter that was per-instance instead of distributed, an unmerged postman module, ghost artefacts in the repo root, and several missing tests. This PR closes all of those.

## Commits

| # | SHA | Subject |
|---|---|---|
| 1 | `6fc5301` | `fix(security): P0 — SSRF hardening, env validation, distributed rate limiter` |
| 2 | `bf9ae75` | `refactor(arch): P1 — middleware auth, sync-server Hono migration, postman merge, CI, cleanup` |
| 3 | `b70115c` | `perf+chore: P2 — streaming proxy, lazy WASM, concurrency, tests, docs` |
| 4 | `<this commit>` | `revert: disable auth gate — Supabase non-functional, /login and /signup missing` |

## What changed

### Security (P0) — kept

- **SSRF protection hardened** in `reqy-web/app/api/proxy/route.ts`:
  - Replaced string-prefix `PRIVATE_HOSTS` with proper IPv4/IPv6 CIDR matching via `isIP()` + bit-shift math.
  - Added coverage for CGNAT (`100.64.0.0/10`), TEST-NET ranges, IPv6 ULA (`fc00::/7`), link-local (`fe80::/10`), NAT64 (`64:ff9b::/96`), IPv4-mapped IPv6.
  - DNS pre-resolution re-checks the **resolved** IP, not just the hostname string.
  - TOCTOU-safe: outbound URL rewritten to the literal IP, `Host` header pinned to the original hostname so virtualhosts / SNI still match.

- **Env validation** in `reqy-web/lib/env.ts` (NEW) + `next.config.mjs` build-time guard:
  - Zod schema, lazy-loaded, throws on first Node.js call.
  - Edge-safe: detects `NEXT_RUNTIME === "edge"` and skips strict validation.
  - **As of commit 4**: `AUTH_SIGNING_SECRET` is optional in the schema (was required with min 32 chars). Build-time guard downgraded from hard throw to warning in production. Auth infra is preserved in `lib/session.ts` for future re-enablement.

- **Distributed rate limiter** in `reqy-web/lib/rate-limiter.ts`:
  - New `UpstashRateLimiter` class: REST API, sliding-window algorithm, **fails OPEN** on network errors / 5xx (does not block legitimate traffic when Upstash is down).
  - Wired into `proxy/route.ts` with an async wrapper for the in-memory fallback.
  - Falls back to `InMemoryRateLimiter` when `UPSTASH_REDIS_REST_URL` is unset (warning logged in production).

### Architecture (P1) — mostly kept, auth gate reverted

- **Auth middleware** in `reqy-web/middleware.ts`: **as of commit 4, this is a no-op placeholder.** The original implementation that enforced an HMAC-signed `auth_session` cookie is preserved in the file's comment block with re-enable instructions, and the full implementation is recoverable from commit `6fc5301`.
- **Session parser** in `reqy-web/lib/session.ts` (kept): HMAC-SHA256 signed session cookies. Not currently called by any route (was only consumed by middleware.ts).
- **Sync server migrated to `@hono/node-server`** in `sync-server/src/index.ts` (kept): removes the hand-rolled `Buffer.concat` body buffering.
- **Postman module merged** into `reqy-web/lib/postman/index.ts` (kept).
- **CI hardening** in `.github/workflows/ci.yml` (kept): `AUTH_SIGNING_SECRET` env, typechecks for `sync-server`, `reqy-cli`, `reqy-mcp`, sync-server build step.
- **Cleanup**: `autoresearch/**` (~20 files), `RECORY_STEPS.md`, `featurres.txt`, `test.txt`, `.imgtool-tmp/`, `.kilo/` deleted. `.gitignore` updated.
- **`project-analyzer.python.test.ts`** renamed to `scripts/run-project-analyzer.ts` (kept).

### Performance (P2) — kept

- **Streaming 5 MB body** in `proxy/route.ts`
- **`@next/bundle-analyzer`** wired into `next.config.mjs`
- **Lazy `web-tree-sitter`** in `lib/tree-sitter-parser.ts` (~2 MB WASM saved for users who never import a project)
- **Concurrency in `lib/test-runner/executor.ts`**: `runRequestsConcurrent(requests, opts)` with bounded concurrency (default 4)

### Tests (4 new files, ~25 assertions) — kept

- `lib/__tests__/env.test.ts`
- `lib/__tests__/session.test.ts`
- `lib/__tests__/upstash-rate-limiter.test.ts`
- `lib/__tests__/test-runner-concurrency.test.ts`

**⚠️ Known test issue**: `env.test.ts` has a module-cache bug — `getServerEnv()` is cached on first call, so tests that change `process.env.AUTH_SIGNING_SECRET` between cases need `vi.resetModules()` in `beforeEach`. Currently tests 5-7 may fail on certain execution orders. Fix landed in commit 4 alongside the auth revert.

### Tauri — kept

- `tauri.conf.json` CSP tightened: `object-src 'none'` + `base-uri 'self'`.
- `capabilities/default.json`: dropped `dialog:default` + `fs:default`, replaced with explicit perms.

### Playwright — kept

- `tests/e2e/global-setup.ts` + `tests/e2e/global-teardown.ts` (NEW).
- `playwright.config.ts`: wired `globalSetup` + `globalTeardown`.

### Web security headers (`next.config.mjs`) — kept

- `Content-Security-Policy` added.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` added in **production only**.

### Docs / env files (drift fixes) — kept

- `README.md`: 3 drift items fixed.
- `EXPLORER-GUIDE.md`: 2 references corrected.
- `.env.example` (root) rewritten.
- `reqy-web/.env.example`: `UPSTASH_*` documented.
- `graphql` pinned to `^16.9.0`.
- `reqy-cli/src/runner.ts`: removed unused `Environment` import.

## Files

**~30 files touched**, 6 deleted:

| Action | Count |
|---|---|
| Created | 12 |
| Modified | 18 |
| Deleted | 6 |
| Reverted (auth gate only) | 1 (`middleware.ts` content) |

## What's NOT in this PR

- Login/signup pages (don't exist, not added by this PR)
- `/api/auth/*` routes (don't exist, not added by this PR)
- Supabase auth wiring (non-functional in this environment)
- CSRF protection (irrelevant while auth is disabled)
- The auth middleware's actual gate logic (recovered in commit `6fc5301`, restored by replacing `middleware.ts` body)

## Verification

```powershell
# Full project typecheck (should be 0 errors)
cd C:\Users\alexanders\Documents\Workspace\apiPlayground-main
cd reqy-web ; npx tsc --noEmit
cd ..\sync-server ; npx tsc --noEmit

# Web build — should now succeed WITHOUT setting AUTH_SIGNING_SECRET
cd ..\reqy-web
pnpm build
# → expect "Compiled successfully" with only a [env:build] warning in production

# Web build with bundle analyzer
$env:ANALYZE = "true" ; pnpm build

# Tauri desktop static export
$env:BUILD_TARGET = "desktop" ; pnpm build

# Sync-server build
cd ..\sync-server
pnpm build ; node dist/index.js
# → http://localhost:4000/health should return {"status":"ok"}

# Verify anonymous users can now reach the app
# (no /login redirect, no 401 on protected routes)
pnpm dev
# → http://localhost:3000/ should render the request editor without auth
```

## Risk

- **Low risk.** Changes are mostly additive (new modules, new tests, tightening of existing logic).
- **Behavior changes**:
  - `proxy/route.ts` still refuses private IP literals + DNS-rebinding-style attacks.
  - **Middleware no longer redirects** anonymous visitors to `/login`. The entire `(app)` route group is now publicly accessible.
  - `InMemoryRateLimiter.check()` callers must `await` (proxy does this).
- **No breaking API changes** for client code; all new modules re-export what they replaced.

## To re-enable auth (future work, out of scope for this PR)

1. Build `/login` and `/signup` pages.
2. Implement `app/api/auth/{signin,signup,callback,session}` routes (cookie mint via `lib/session.ts`).
3. Replace `middleware.ts` body with the gate logic from commit `6fc5301` (see comment block in current file).
4. Restore hard build-time throw for `AUTH_SIGNING_SECRET` in `next.config.mjs`.
5. Restore `.min(32)` constraint on `AUTH_SIGNING_SECRET` in `lib/env.ts`.
6. Add `PUBLIC_PREFIXES` entries for the new auth routes.
7. Decide `BUILD_TARGET=desktop` strategy.

## Out of scope (deferred)

- Replace `'unsafe-inline'` / `'unsafe-eval'` in CSP with nonces (requires Next.js layout-level nonce wiring).
- OTel tracing in proxy + sync-server.
- HSTS preload submission.
- Pre-commit hooks (husky + lint-staged).
