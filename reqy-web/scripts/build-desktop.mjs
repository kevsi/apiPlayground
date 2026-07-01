#!/usr/bin/env node
// Build wrapper for the Tauri desktop bundle.
//
// Two responsibilities:
//   1. Set BUILD_TARGET=desktop so next.config.mjs enables `output: 'export'`
//      and skips `headers()`. Cross-platform alternative to cross-env.
//   2. Patch each `app/api/**/route.ts` so the `dynamic` export is a string
//      literal that Next.js 16 can statically analyze. Next.js requires every
//      route to declare `force-static` (or `revalidate`) when `output: 'export'`
//      is set, and it rejects runtime expressions like a ternary on
//      `process.env.BUILD_TARGET`. We swap the web-default `'force-dynamic'`
//      for `'force-static'` before the build, then restore the originals in
//      a `finally` block so source files always end up unchanged.

process.env.BUILD_TARGET = 'desktop'

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const WEB_VALUE = "export const dynamic = 'force-dynamic';"
const DESKTOP_VALUE = "export const dynamic = 'force-static';"

// Clean stale build artifacts before each run. On Windows, `.next/` files are
// frequently held open by antivirus / IDE indexing and cause EPERM errors when
// Next.js tries to copy them into `out/`. A fresh start is the most reliable fix.
const dirsToClean = ['.next', 'out']
for (const dir of dirsToClean) {
  if (fs.existsSync(dir)) {
    console.log(`[build-desktop] Cleaning ${dir}/`)
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    } catch (err) {
      console.warn(`[build-desktop] Could not fully clean ${dir}/: ${err.message} — continuing anyway`)
    }
  }
}

function findRouteFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      findRouteFiles(fullPath, results)
    } else if (entry.name === 'route.ts') {
      results.push(fullPath)
    }
  }
  return results
}

const apiDir = path.resolve('app/api')
const routeFiles = findRouteFiles(apiDir)

if (routeFiles.length === 0) {
  console.error('[build-desktop] No route.ts files found in app/api/')
  process.exit(1)
}

console.log(`[build-desktop] Patching ${routeFiles.length} route files (dynamic: force-dynamic → force-static)`)

// Snapshot originals so we can restore even if the build crashes.
const backups = new Map()
for (const file of routeFiles) {
  backups.set(file, fs.readFileSync(file, 'utf8'))
}

let buildStatus = 1
try {
  for (const file of routeFiles) {
    const original = backups.get(file)
    if (!original.includes(WEB_VALUE)) {
      console.warn(`[build-desktop] Skipping ${path.relative(process.cwd(), file)}: expected "${WEB_VALUE}" not found.`)
      continue
    }
    fs.writeFileSync(file, original.replace(WEB_VALUE, DESKTOP_VALUE))
  }

  console.log('[build-desktop] Running next build --webpack...')
  const result = spawnSync('next', ['build', '--webpack'], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  buildStatus = result.status ?? 1
} finally {
  // Always restore source files to their original state.
  for (const [file, content] of backups) {
    fs.writeFileSync(file, content)
  }
  console.log('[build-desktop] Restored route files to original state')
}

process.exit(buildStatus)
