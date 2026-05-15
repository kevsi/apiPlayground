"use client"

import type { DetectedRoute, SavedProject, AnalysisMode } from "@/hooks/use-projects-store"
import { readDir, readTextFile } from "@tauri-apps/plugin-fs"

// ── Constants ─────────────────────────────────────────────────────────────

const IGNORED_FOLDERS = [
  "node_modules", ".git", ".next", "dist", "build",
  "__pycache__", ".venv", "venv", "vendor",
]
const MAX_FILES = 150

// ── Public API ───────────────────────────────────────────────────────────

export async function analyzeProject(
  folderPath: string,
  mode: AnalysisMode,
  apiKey?: string,
): Promise<SavedProject> {
  if (mode === "ai") {
    if (!apiKey) throw new Error("Clé API requise pour l'analyse IA")
    return analyzeWithAI(folderPath, apiKey)
  }
  return analyzeStatic(folderPath)
}

// ── Static analysis ──────────────────────────────────────────────────────

async function analyzeStatic(folderPath: string): Promise<SavedProject> {
  const filePaths = await getFiles(folderPath)
  const files: { path: string; content: string }[] = []
  const routes: DetectedRoute[] = []

  // Read each file content
  for (const fp of filePaths) {
    try {
      const content = await readTextFile(fp)
      files.push({ path: fp, content })
    } catch { /* skip unreadable file */ }
  }

  // Detect framework before route detection (framework-first strategy)
  const framework = detectFramework(files)

  // Detect routes per framework
  for (const f of files) {
    const detected = detectRoutes(f.content, f.path, framework)
    for (const r of detected) r.sourceFile = f.path
    routes.push(...detected)
  }

  return {
    id: `proj-${Date.now()}`,
    name: deriveName(folderPath),
    framework,
    folderPath,
    port: detectPort(files),
    routes,
    analyzedAt: new Date().toISOString(),
    mode: "static",
  }
}

/** Recursive walk: returns all native OS file paths under `folderPath`. */
async function getFiles(folderPath: string, depth = 0): Promise<string[]> {
  if (depth > 8) return []
  const results: string[] = []

  try {
    const entries = await readDir(folderPath)
    for (const entry of entries) {
      if (results.length >= MAX_FILES) break
      if (shouldSkip(entry.name)) continue
      if (entry.isDirectory) {
        const childPath = `${folderPath}/${entry.name}`
        results.push(...(await getFiles(childPath, depth + 1)))
      } else if (entry.isFile) {
        results.push(`${folderPath}/${entry.name}`)
      }
      if (results.length >= MAX_FILES) break
    }
  } catch { /* skip unreadable folder */ }

  return results
}

function shouldSkip(name: string): boolean {
  return IGNORED_FOLDERS.includes(name) || name.startsWith(".")
}

function deriveName(folderPath: string): string {
  return folderPath.split(/[/\\]/).filter(Boolean).pop() ?? "Projet"
}

// ── Port detection ─────────────────────────────────────────────────────────

const PORT_PATTERNS: RegExp[] = [
  // app.listen(3001, ...)
  /\.listen\(\s*(\d+)\s*,/,
  // app.listen(process.env.PORT || 3001, ...)
  /\.listen\(\s*process\.env\.PORT\s*\|\|\s*(\d+)\s*,/,
  // const PORT = process.env.PORT || 3001;
  /process\.env\.PORT\s*\|\|\s*(\d+)/,
]

function detectPort(files: { path: string; content: string }[]): number | undefined {
  const all = files.map((f) => f.content).join("\n")
  for (const p of PORT_PATTERNS) {
    p.lastIndex = 0
    const m = p.exec(all)
    if (m) return parseInt(m[1], 10)
  }
  return undefined
}

// ── Framework detection ───────────────────────────────────────────────────

interface FileInfo {
  path: string
  content: string
}

function detectFramework(files: FileInfo[]): string {
  if (files.length === 0) return "unknown"
  const all = files.map((f) => f.content).join("\n")

  // Node.js / Express — strongest signal first
  if (/require\s*\(\s*['"]express['"]\s*\)/.test(all)) return "express"
  if (/express\s*\(\s*\)/.test(all))                       return "express"

  // Python / FastAPI
  if (/from\s+fastapi\s+import/.test(all)) return "fastapi"
  if (/FastAPI\s*\(/.test(all))             return "fastapi"

  // NestJS
  if (/@nestjs/.test(all)    ) return "nestjs"
  if (/@Controller/.test(all)) return "nestjs"

  // Laravel / Symfony
  if (/Route::/.test(all))             return "laravel"
  if (/@return\s+Response/.test(all))  return "laravel"

  return "unknown"
}

// ── Route detection per framework ─────────────────────────────────────────

// --- Express / Node.js -----------------------------------------------------

const EXPRESS_PATTERNS: RegExp[] = [
  // app.get('/path', ...)
  /app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"\s][^'"\)]*)['"]/g,
  // router.get('/path', ...)
  /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"\s][^'"\)]*)['"]/g,
]

function detectExpress(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  for (const p of EXPRESS_PATTERNS) {
    let m
    p.lastIndex = 0
    while ((m = p.exec(content)) !== null) {
      routes.push(makeRoute(m[1].toUpperCase(), m[2], ""))
    }
  }
  return routes
}

// --- FastAPI / Python -----------------------------------------------------

const FASTAPI_PATTERNS: RegExp[] = [
  // @router.get("/path")
  /@router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"\s][^'"\)]*)['"]/g,
  // @app.get("/path")
  /@app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"\s][^'"\)]*)['"]/g,
]

function detectFastAPI(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  for (const p of FASTAPI_PATTERNS) {
    let m
    p.lastIndex = 0
    while ((m = p.exec(content)) !== null) {
      routes.push(makeRoute(m[1].toUpperCase(), m[2], ""))
    }
  }
  return routes
}

// --- NestJS / TypeScript ---------------------------------------------------

const NESTJS_PATTERNS: RegExp[] = [
  // @Get('path')
  /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"]([^'"\s][^'"\)]*)['"]/g,
  // @Get()
  /@(Get|Post|Put|Delete|Patch)\s*\(\s*\)/g,
]

function detectNestJS(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  for (const p of NESTJS_PATTERNS) {
    let m
    p.lastIndex = 0
    while ((m = p.exec(content)) !== null) {
      const method = m[1].toUpperCase()
      const path   = m[2] ?? ""
      routes.push(makeRoute(method, path, ""))
    }
  }
  return routes
}

// --- Laravel / PHP ---------------------------------------------------------

const LARAVEL_PATTERNS: RegExp[] = [
  // Route::get('/path', ...)
  /Route::(get|post|put|delete|patch|any)\s*\(\s*['"]([^'"\s][^'"\)]*)['"]/g,
]

function detectLaravel(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  for (const p of LARAVEL_PATTERNS) {
    let m
    p.lastIndex = 0
    while ((m = p.exec(content)) !== null) {
      routes.push(makeRoute(m[1].toUpperCase(), m[2], ""))
    }
  }
  return routes
}

// ── Router dispatcher ─────────────────────────────────────────────────────

function detectRoutes(
  content: string,
  filePath: string,
  framework: string,
): DetectedRoute[] {
  const raw = matchFramework(content, framework, filePath)

  // Déduplique sur (method, path)
  const seen = new Set<string>()
  return raw.filter((r) => {
    const key = `${r.method}|${r.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function matchFramework(content: string, framework: string, _fp: string): DetectedRoute[] {
  switch (framework) {
    case "express":  return detectExpress(content)
    case "fastapi":  return detectFastAPI(content)
    case "nestjs":   return detectNestJS(content)
    case "laravel":  return detectLaravel(content)
    default:         // inconnu → on scanne tous les patterns pertinents
      return [...detectExpress(content), ...detectFastAPI(content), ...detectNestJS(content), ...detectLaravel(content)]
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function makeRoute(
  method: string,
  path: string,
  description: string,
): DetectedRoute {
  return {
    name: "",
    method: method as DetectedRoute["method"],
    path: normalizePath(path),
    headers: [],
    body: "",
    bodyType: "none",
    authRequired: false,
    description,
    sourceFile: "",
  }
}

function normalizePath(path: string): string {
  return path
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/:([a-zA-Z_]\w*)/g, ":$1")
}

// ── AI analysis (placeholder) ────────────────────────────────────────────

export async function analyzeWithAI(
  folderPath: string,
  apiKey: string,
): Promise<SavedProject> {
  return {
    id: `proj-${Date.now()}`,
    name: deriveName(folderPath),
    framework: "unknown",
    folderPath,
    port: undefined,
    routes: [],
    analyzedAt: new Date().toISOString(),
    mode: "ai",
  }
}
