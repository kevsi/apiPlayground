#!/usr/bin/env node
// One-shot refactor: move sidebar/header/wrapper out of each page so the
// (app)/layout.tsx owns them. Idempotent — running twice is a no-op.

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('app/(app)')
const PAGES = [
  'page.tsx',
  'dashboard/page.tsx',
  'collections/page.tsx',
  'mocks/page.tsx',
  'settings/page.tsx',
  'runner/page.tsx',
  'ai-insights/page.tsx',
  'documentation/page.tsx',
  'workspaces/page.tsx',
  'graphql/page.tsx',
  'my-projects/page.tsx',
  'sdks/page.tsx',
]

// Match the opening of the wrapper: outer div + ApiSidebar + inner div + ApiHeader
// Returns the "before" and "after" text.
const WRAPPER_OPEN_REGEX = /    <div className="flex (?:h-screen|min-h-screen) bg-background(?: bg-dot-pattern)?">\s*\n\s*<ApiSidebar[^>]*\/>\s*\n\s*\n?\s*<div className=\{cn\(\s*\n[\s\S]*?\}\s*\)>\s*\n\s*<ApiHeader\s*\/>\s*\n\s*\n?\s*/

// Match the closing of the wrapper: inner div close + outer div close + return close
const WRAPPER_CLOSE_REGEX = /\n\s*<\/div>\s*\n\s*<\/div>\s*\n\s*\)\s*\n\}\s*$/

function refactor(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')

  const before = content

  // 1. Remove unused imports
  content = content.replace(/import \{ ApiSidebar \} from "@\/components\/api-sidebar"\n/g, '')
  content = content.replace(/import \{ ApiHeader \} from "@\/components\/api-header"\n/g, '')
  content = content.replace(/import \{ useSidebar \} from "@\/contexts\/sidebar-context"\n/g, '')

  // 2. Remove useSidebar hook (only if isCollapsed/toggleSidebar aren't used elsewhere)
  //    Heuristic: count occurrences of isCollapsed and toggleSidebar AFTER removing the destructuring.
  const hookRegex = /  const \{ isCollapsed, toggleSidebar \} = useSidebar\(\)\n/
  if (hookRegex.test(content)) {
    const withoutHook = content.replace(hookRegex, '')
    // If isCollapsed / toggleSidebar still appear elsewhere (rare), keep the hook.
    const stillUsed = /\bisCollapsed\b/.test(withoutHook) || /\btoggleSidebar\b/.test(withoutHook)
    if (!stillUsed) {
      content = withoutHook
    }
  }

  // 3. Replace wrapper opening: collapse the outer/inner div + sidebar + header
  //    into nothing (children render directly).
  const openMatch = content.match(WRAPPER_OPEN_REGEX)
  if (openMatch) {
    content = content.replace(WRAPPER_OPEN_REGEX, '')
  }

  // 4. Replace wrapper closing: the last </div></div>) in the return statement.
  //    Strategy: find the last `return (` and apply close regex only to its tail.
  const lastReturn = content.lastIndexOf('return (')
  if (lastReturn !== -1) {
    const afterReturn = content.slice(lastReturn)
    const closeMatch = afterReturn.match(WRAPPER_CLOSE_REGEX)
    if (closeMatch) {
      const closeIdx = lastReturn + afterReturn.indexOf(closeMatch[0])
      content = content.slice(0, closeIdx) + '\n  )' + content.slice(closeIdx + closeMatch[0].length)
    }
  }

  if (content === before) {
    return { changed: false }
  }

  fs.writeFileSync(filePath, content, 'utf8')
  return { changed: true, removedLines: before.split('\n').length - content.split('\n').length }
}

let changedCount = 0
for (const rel of PAGES) {
  const filePath = path.join(ROOT, rel)
  if (!fs.existsSync(filePath)) {
    console.warn(`SKIP (not found): ${filePath}`)
    continue
  }
  const result = refactor(filePath)
  if (result.changed) {
    changedCount++
    console.log(`OK  ${rel} (-${result.removedLines} lines)`)
  } else {
    console.log(`SKIP (no changes): ${rel}`)
  }
}

console.log(`\n${changedCount}/${PAGES.length} pages refactored`)
