2026-07-28 — Dependency audit & remediation

- Applied workspace-level `pnpm` overrides for `lodash`, `lodash-es`, `postcss`, `fast-uri`, `sharp`, `js-yaml`, and `@hono/node-server` to remediate security advisories reported by `pnpm audit`.
- Ran full test suite and fixed multiple failing tests introduced by the remediation.
- Note: ESLint reports remaining warnings and 30 errors; linting needs further manual refactoring.
