# Scripts & Configuration

## Scripts — `scripts/`

| File | Purpose |
|------|---------|
| `validate-analyzer.ts` | Validates the project analyzer output against expected patterns. Runs as a test to ensure endpoint detection accuracy. |
| `validate-mock-matcher.ts` | Validates mock route matching logic against test fixtures. |

Both scripts run via `tsx` and are used in CI for validation.

## Project Configuration

### Root
| File | Purpose |
|------|---------|
| `package.json` | Root workspace configuration. Defines pnpm workspaces: `reqy-web`, `src-tauri`. Scripts: `dev`, `build`, `tauri:dev`, `tauri:build`. |
| `pnpm-workspace.yaml` | pnpm workspace definition with packages: `reqy-web`, `src-tauri`. |
| `tsconfig.json` | Root TypeScript config (minimal, extends reqy-web config). |

### reqy-web
| File | Purpose |
|------|---------|
| `package.json` | Next.js app dependencies and scripts. Key deps: `next@16.2.6`, `react@19`, `@tauri-apps/*`, `idb-keyval`, `lucide-react`, `recharts`, `sonner`, `@radix-ui/*`. Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`. |
| `tsconfig.json` | Next.js TypeScript config — strict mode, path aliases `@/*`, incremental compilation. |
| `next.config.mjs` | Next.js config — transpiles `@tauri-apps/*`, webpack externals for Tauri. |
| `eslint.config.mjs` | ESLint flat config — Next.js, React, TypeScript rules. |
| `postcss.config.mjs` | PostCSS with Tailwind CSS and Autoprefixer. |
| `components.json` | shadcn/ui configuration — style: "new-york", rsc: false, icon: lucide-react. |

### src-tauri
| File | Purpose |
|------|---------|
| `Cargo.toml` | Rust crate manifest. Crate type: `cdylib` for Tauri. Dependencies: `tauri v2`, `reqwest`, `serde`, `tauri-plugin-fs`, `tauri-plugin-dialog`. |
| `tauri.conf.json` | Tauri v2 app config — identifier, windows, plugins (fs, dialog), capabilities, bundle settings. |
| `build.rs` | Build script for embedding assets and generating Tauri config. |

## Build Pipeline
1. `pnpm dev` — starts Next.js dev server + Tauri dev (hot reload)
2. `pnpm tauri:build` — runs `cargo build --release` + `next build` + bundles Tauri app
3. CI runs: `pnpm lint`, `pnpm typecheck`, `pnpm test` before build
