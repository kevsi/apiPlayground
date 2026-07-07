import type { RequestItem } from "./types.js"

export interface DetectedRoute {
  method: string
  path: string
  name?: string
  authRequired?: boolean
  authType?: string
  sourceFile?: string
  confidence?: "LOW" | "MEDIUM" | "HIGH"
}

const IGNORED_FOLDERS = new Set([
  "node_modules", "dist", "build", ".git", ".next", ".nuxt", "coverage", "vendor", "__pycache__",
])

const AUTH_INDICATORS = [
  /passport\.authenticate/,
  /ensureAuth/,
  /requireAuth/,
  /verifyJWT/,
  /auth\(/,
  /getServerSession/,
  /currentUser\(/,
  /supabase\.auth/,
]

export async function analyzeProjectRoutes(folderPath: string): Promise<{
  folderPath: string
  routeCount: number
  routes: DetectedRoute[]
  generatedRequests: Array<Partial<RequestItem>>
}> {
  const fs = await import("node:fs/promises")
  const path = await import("node:path")

  async function walk(dir: string, depth = 0): Promise<string[]> {
    if (depth > 6) return []
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      if (entry.name.startsWith(".") || IGNORED_FOLDERS.has(entry.name.toLowerCase())) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await walk(fullPath, depth + 1)))
      } else if (entry.isFile() && entry.name.match(/\.(ts|js|tsx|jsx|py|rb|php|go|java|kt|cs)$/)) {
        files.push(fullPath)
      }
    }
    return files.slice(0, 200)
  }

  const files = await walk(folderPath)
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()

  for (const filePath of files) {
    let content: string
    try {
      content = await fs.readFile(filePath, "utf-8")
    } catch {
      continue
    }

    // Express / Fastify / Laravel style
    const appRouterRegex = /\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi
    let m: RegExpExecArray | null
    while ((m = appRouterRegex.exec(content)) !== null) {
      const method = m[1]!.toUpperCase()
      const routePath = normalizePath(m[2]!)
      const key = `${method}|${routePath}`
      if (seen.has(key)) continue
      seen.add(key)
      routes.push(buildRoute(method, routePath, filePath, content))
    }

    // NestJS style
    const nestRegex = /@(Get|Post|Put|Patch|Delete|Head|Options)\s*(?:\(\s*['"`]([^'"`]+)['"`]\s*\))?/g
    while ((m = nestRegex.exec(content)) !== null) {
      const method = m[1]!.toUpperCase()
      const routePath = normalizePath(m[2] ?? "/")
      const key = `${method}|${routePath}`
      if (seen.has(key)) continue
      seen.add(key)
      routes.push(buildRoute(method, routePath, filePath, content))
    }

    // FastAPI / Flask decorators
    const decoratorRegex = /@(app|router)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi
    while ((m = decoratorRegex.exec(content)) !== null) {
      const method = m[2]!.toUpperCase()
      const routePath = normalizePath(m[3]!)
      const key = `${method}|${routePath}`
      if (seen.has(key)) continue
      seen.add(key)
      routes.push(buildRoute(method, routePath, filePath, content))
    }

    // Django path / re_path
    const djangoRegex = /path\s*\(\s*['"`]([^'"`]+)['"`]/g
    while ((m = djangoRegex.exec(content)) !== null) {
      const routePath = normalizePath(m[1]!)
      const key = `GET|${routePath}`
      if (seen.has(key)) continue
      seen.add(key)
      routes.push(buildRoute("GET", routePath, filePath, content))
    }

    // Next.js App Router route handlers
    const nextRegex = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/gi
    while ((m = nextRegex.exec(content)) !== null) {
      const method = m[1]!.toUpperCase()
      const relativePath = path.relative(folderPath, filePath)
      const routePath = derivePathFromFile(relativePath)
      const key = `${method}|${routePath}`
      if (seen.has(key)) continue
      seen.add(key)
      routes.push(buildRoute(method, routePath, filePath, content))
    }
  }

  const generatedRequests: Array<Partial<RequestItem>> = routes.map((r) => ({
    name: `${r.method} ${r.path}`,
    method: r.method as RequestItem["method"],
    url: `http://localhost:3000${r.path}`,
    endpoint: r.path,
    authType: (r.authRequired ? "bearer" : "none") as RequestItem["authType"],
  }))

  return {
    folderPath,
    routeCount: routes.length,
    routes,
    generatedRequests,
  }
}

function normalizePath(p: string): string {
  p = p.trim()
  if (!p.startsWith("/")) p = `/${p}`
  return p.replace(/\/+/g, "/")
}

function derivePathFromFile(relativePath: string): string {
  const cleaned = relativePath
    .replace(/\\/g, "/")
    .replace(/\.(ts|js|tsx|jsx|py|rb|php|go|java|kt|cs)$/, "")
    .replace(/\/route$/, "")
    .replace(/^api\//, "/")
  return normalizePath(cleaned)
}

function buildRoute(method: string, path: string, sourceFile: string, content: string): DetectedRoute {
  const authRequired = AUTH_INDICATORS.some((re) => re.test(content))
  return {
    method,
    path,
    sourceFile,
    authRequired,
    authType: authRequired ? "middleware" : "none",
    confidence: authRequired ? "MEDIUM" : "LOW",
  }
}
