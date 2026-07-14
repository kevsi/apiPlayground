# Reqly — Product Specification (global)

> This is the **global product spec / roadmap** for Reqly. It complements the
> feature-level `SPEC.md` (AI Sidebar). It records what the product is, what
> exists today (verified against the codebase), what is explicitly out of scope,
> and the known gaps / roadmap.
>
> Status: v1 draft. Non-binding — to be corrected by the product owner.

---

## 1. Vision & positioning

Reqly is an **API testing platform** that ships as a **web app, a desktop app
(Tauri), a CLI runner (`recli`), and an MCP server**, with optional
**workspace sync**. It targets the same job as Postman/Insomnia (build, send,
inspect and automate HTTP/GraphQL/WebSocket requests) while adding
**AI-assisted** workflows and **agent-facing** access via MCP.

Core promise: _a single, local-first workspace for designing, testing and
sharing API requests across web, desktop and CLI, with AI and agents as first-class citizens._

---

## 2. Target users

- **Individual API developers** — manual request building, environments, scripting.
- **QA / automation engineers** — assertions, batch runner, CLI in CI.
- **Teams** — shared collections via workspaces + sync server.
- **AI agents / power users** — drive Reqly through the MCP server and the AI Sidebar.

---

## 3. Surfaces (monorepo)

| Package           | Role                                                                | Verified                  |
| ----------------- | ------------------------------------------------------------------- | ------------------------- |
| `reqy-web`        | Next.js 16 web app (React 19, TS 5.7) — all UI + API routes         | ✅                        |
| `src-tauri`       | Rust desktop shell (Tauri v2) wrapping `reqy-web`                   | ✅ (`cargo check` passes) |
| `recli`           | API testing CLI — assertions, scripts, GraphQL, snapshots, parallel | ✅ (dist built)           |
| `reqy-mcp`        | MCP server exposing collections to AI agents (HTTP, port 3311)      | ✅                        |
| `sync-server`     | Hono + better-sqlite3 workspace sync backend (JWT session cookies)  | ✅                        |
| `packages/shared` | Shared types between surfaces                                       | ✅                        |

---

## 4. Feature inventory (current state)

### 4.1 Request building & execution

- Method / URL / headers / query params / auth / body editors.
- Auth section supports common schemes (bearer, basic, api-key, OAuth2, …).
- Proxy route (`/api/proxy`) for same-origin requests; AI proxy (`/api/proxy-ai`).
- `runner` page rebuilt on `runCollection` + dedicated executor (summary, progress, per-request details, empty state).

### 4.2 Collections, folders & environments

- Collections + folder tree, search, request save dialog.
- Environments + variable store (`hooks/store/environments.ts`, `environment-selector.tsx`); `{{var}}` interpolation.

### 4.3 Protocols

- **REST** (primary).
- **GraphQL** — editor, schema diff, query builder, AI dialog.
- **WebSocket** — connection bar, headers/auth panels, message composer.
- **SSE** — `sse-panel.tsx`.

### 4.4 Assertions & test-runner

- `assertion-editor.tsx`, `lib/test-runner/*` (assertions, executor, data-driven, scripts, junit-export).
- Tests exist for assertions, concurrency, data-driven, junit, scripts.
- `recli` mirrors this on the CLI side.

### 4.5 SDK generation

- `typescript-fetch`, `python`, `go`, `rust`, `java`, `csharp`, `php`, `kotlin`, `swift5`, `ruby`, `dart` (via OpenAPI Generator, proxied through `/api/sdk-generate`).
- Server base URL derived from request host + response inference.
- **Build manifests auto-injected** into the generated ZIP (package.json + tsconfig for TS, pyproject for Python, go.mod, Cargo.toml, README fallback) so SDKs are usable out of the box.
- Native **Save As** on desktop (Tauri `save_file`), browser download otherwise.

### 4.6 Import / Export

- Postman import/export (`/api/postman-import`, `/api/postman-export`), GitHub import.
- OpenAPI export (collection → spec).

### 4.7 AI

- **AI Sidebar** (Phases 1–4 landed): persistent right sidebar, chat, contextual awareness per page, action pipeline controlling stores (request execution, collections, projects, workspaces, variables).
- Codegen, explanations, AI-driven assertion conversion, schema sampling, citation/suggestion helpers.
- Cloud + local engines; streaming stubbed (placeholder in `src/ai/types.ts`).

### 4.8 Collaboration & sync

- Workspaces + members + invitations; Git panel.
- `sync-server` with signed session cookies (`AUTH_SIGNING_SECRET`); dev-mode mock session.
- GitHub OAuth + Postman OAuth for identity / integrations.

### 4.9 Agent access (MCP)

- `reqy-mcp` HTTP server exposes collections/requests to agents (tools like `reqly_list_collections`, `reqly_run_request`, …).
- Desktop MCP start fixed to be non-blocking; errors surfaced in Settings.

### 4.10 CLI (`recli`)

- Assertions, scripts, GraphQL, snapshots, parallel runs.

---

## 5. Non-goals / out of scope (explicit)

- **Native email/password accounts** — auth is currently federated (GitHub/Postman OAuth) + sync-server signed sessions. Decision pending (see §6).
- **Payment / billing / SaaS multi-tenancy** — not in scope for v1.
- **Visual flow / no-code builders** beyond request composition.
- **Hosted cloud execution** — requests run client-side / via proxy; sync-server only stores state.

---

## 6. Known gaps & roadmap

| Gap                                             | Status                               | Note                                                                                  |
| ----------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| Native accounts (email/password, MFA, SSO)      | **Decision needed**                  | OAuth-only today; high-risk auth change → needs product decision + secrets            |
| AI response **streaming**                       | Open (`src/ai/types.ts` placeholder) | Wired as full-text today                                                              |
| Verify **non-TS generators** by real generation | Partial                              | TS verified; others emit manifests but unverified end-to-end                          |
| SDK **schema inference** quality                | Weak                                 | Produces loose `object` / occasional inaccurate model; needs request/response schemas |
| **Desktop rebuild** verification                | Pending                              | Rust changes compile (`cargo check`); full `tauri build` not yet run this session     |
| **i18n**                                        | None                                 | UI is FR/EN mixed, no i18n system                                                     |
| **Test coverage gate**                          | **Done**                             | Floor thresholds on unit-testable logic (stmts 30 / branches 70 / fns 55)             |
| Commit hygiene of working tree                  | In progress                          | Large mixed uncommitted delta being grouped/committed                                 |

---

## 7. Definition of Done (release criteria)

A release is ready when:

1. `pnpm test` (Vitest, with coverage gate) is green on all packages.
2. `pnpm lint` + `tsc --noEmit` clean on every package.
3. `pnpm build` succeeds for web + sync-server + recli + desktop.
4. E2E (Playwright) green for the core request→response→runner flow.
5. Auth model decided and, if native, implemented + tested.
6. SDK generation verified for at least TS + one other generator by real generation.
7. Docs (this spec + `SPEC.md` + README) reflect the shipped surface.
