# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — reqy-mcp: 13 new MCP tools (3 phases)

#### Phase 1 — Collection lifecycle & execution history

- **`run_collection_with_assertions`** — Execute all requests in a collection sequentially and evaluate assertions (status code, JSON path, header, response time, body contains). Returns a full `CollectionRunRecord` test report with per-request pass/fail status.
- **`get_request_history`** — Retrieve execution history for a specific request (configurable limit, defaults to 20 runs).
- **`get_run_history`** — Retrieve recent collection run history, optionally filtered by collection ID.
- **`duplicate_environment`** — Duplicate an environment with all its variables and re-generate IDs.
- **`reorder_requests`** — Reorder requests inside a collection by providing the full ordered list of request IDs.
- **Assertion engine** (`src/assertions.ts`) — Custom server-side assertion evaluator supporting 5 types (`status-code`, `response-time`, `json-path`, `header`, `body-contains`) and 10 operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `regex`, `exists`, `notExists`).
- **Execution history store** — In-memory ring buffer (100 records cap) in `CollectionStore`; persisted via the bundle persist callback.

#### Phase 2 — Import/export, tree view, JUnit report

- **`import_from_curl`** — Parse a `curl` command string and create a request from it. Supports `-X`, `-H`, `-d`, `-u`, and URL extraction.
- **`export_request_to_curl`** — Serialize a stored request to an equivalent `curl` command.
- **`get_collection_tree`** — Return the full tree of a collection (folders + nested folders + requests).
- **`resolve_variables`** — Resolve `{{variable}}` placeholders in a string against an environment.
- **`export_collection_to_junit`** — Export the last run record of a collection as JUnit XML (compatible with CI dashboards).
- **`curl-parser.ts`** — Tokenizer + parser supporting single/double quoted strings, `--key=value` forms, and chained flags.
- **`junit-export.ts`** — XML serializer with proper escaping for testcase names, failure messages, and assertions.

#### Phase 3 — AI-assisted generation, OpenAPI, project route analysis

- **`generate_request_from_description`** — Generate a request definition from plain text using heuristic inference (method from verbs, URL from regex, headers from keywords).
- **`import_from_openapi`** — Parse an OpenAPI 3.x or Swagger 2.0 spec (JSON or YAML) and create collections + requests. Includes a lightweight YAML parser (no `js-yaml` dependency).
- **`export_to_openapi`** — Export all collections to an OpenAPI 3.0 JSON spec.
- **`analyze_project_routes`** — Static analysis of a local project folder to detect HTTP routes (Express, Fastify, NestJS, Django, FastAPI, Flask, Laravel, Next.js App Router). Detects auth middleware patterns. Optional `save_collection_id` to bulk-create requests.
- **`ai-request-generator.ts`** — Heuristic engine inferring HTTP method, URL, headers, and body from natural-language descriptions.
- **`openapi.ts`** — OpenAPI parser/exporter (JSON + YAML, 3.0 + Swagger 2.0).
- **`project-analyzer.ts`** — Recursive filesystem walker with framework-specific route detection regexes.

#### Documentation

- **`reqy-mcp/README.md`** — New README documenting all 42 MCP tools, CLI flags, security model (SSRF protection, response size cap, timeout), and development workflow.

### Added — Build & test pipeline

- **`package.json` (root)** — `pnpm build` now compiles all 4 packages (`reqy-web`, `reqy-cli`, `reqy-mcp`, `sync-server`); `pnpm test` runs tests for all 4 packages.

### Fixed

- **`reqy-mcp/src/store.test.ts`** — Test "throws when collection not found" was expecting `getCollection` to throw, but `getCollection` is a getter that returns `undefined` (the mutating methods `updateCollection`/`deleteCollection`/etc. throw). Updated test to verify both the getter behavior and the throwing mutator.
- **`reqy-mcp/src/tools.test.ts`** — Test "runs a request with SSRF protection" was using the default `makeStore()` request with a public URL (`https://api.example.com`), which is not blocked by SSRF. Updated to create a dedicated localhost request that triggers the SSRF guard.
- **`sync-server/src/db.ts`** — `folders` table was missing the `version INTEGER NOT NULL DEFAULT 1` column, but `sync-engine.ts` queries it in `getChangesSince` and `pushChanges`. Added the column to the schema.

### Removed

- **`scripts/validate-analyzer.ts`** — Broken script importing a non-existent `../reqy-web/lib/project-analyzer.test`. Removed.

### Security

- SSRF protection in `reqy-mcp` blocks RFC 1918 private addresses, loopback, link-local, cloud metadata endpoints (169.254.169.254), and multicast by default. Override with `--allow-local-hosts`.
- Response size cap (10 MB default) and per-request timeout (30 s default) enforced in `reqy-mcp`.

## [v0.2.0-security-hardening] — Previous release

SSRF hardening, distributed rate limiter, streaming proxy response, lazy tree-sitter, postman module merged, sync-server Hono migration. Auth gate disabled (Supabase non-functional); HMAC session parser preserved in `reqy-web/lib/session.ts` for future re-enablement.
