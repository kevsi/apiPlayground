import { NextRequest, NextResponse } from "next/server"
import { formatZodError, githubImportBodySchema, githubImportResponseSchema } from "@/lib/import-schemas"

const IGNORED_FOLDERS = [
  "node_modules", ".git", ".next", "dist", "build", "out",
  "__pycache__", ".venv", "venv", "env", "vendor", ".turbo",
  "coverage", ".cache", "storybook-static", ".husky",
  ".github", ".gitignore", "README.md", "LICENSE",
  "test", "tests", "__tests__", "spec", "specs", "e2e",
  "fixtures", "mocks", "__mocks__", "stubs", "examples",
  "benchmark", "benchmarks",
]

const NON_ROUTE_PATH_SEGMENTS = [
  "/test/", "/tests/", "/__tests__/", "/spec/", "/specs/",
  "/e2e/", "/fixtures/", "/mocks/", "/__mocks__/", "/stubs/",
  "/examples/", "/benchmark/", "/benchmarks/",
  "/scripts/", "/tools/", "/cli/",
  "/lib/request.", "/lib/response.", "/lib/router.",
  "/lib/router/", "/lib/middleware/", "/lib/utils.",
  "/lib/helpers.", "/lib/core.", "/lib/common.",
  "/lib/application.", "/lib/express.",
  "/src/lib/", "/internals/", "/internal/",
  "webpack.config", "vite.config", "rollup.config",
  "jest.config", "vitest.config", "babel.config",
  ".test.", ".spec.", "-test.", "-spec.",
  ".stories.", ".story.",
]

function isNonRouteFile(filePath: string): boolean {
  const normalized = "/" + filePath.replace(/\\/g, "/").toLowerCase()
  return NON_ROUTE_PATH_SEGMENTS.some((segment) => normalized.includes(segment))
}

const MAX_FILES = 100
const GITHUB_API_BASE = "https://api.github.com"
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

function getGithubHeaders(token?: string) {
  const authToken = token?.trim() || GITHUB_TOKEN
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "api-playground",
  }
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`
  }
  return headers
}

const LANGUAGE_EXTENSION_MAP: Record<string, string[]> = {
  JavaScript: ["js", "jsx", "ts", "tsx"],
  Python: ["py"],
  PHP: ["php"],
  Go: ["go"],
  Java: ["java"],
  Ruby: ["rb"],
  CSharp: ["cs"],
  Kotlin: ["kt", "kts"],
  Swift: ["swift"],
  Rust: ["rs"],
}

function detectLanguage(files: { path: string; content: string }[]): string {
  const counts: Record<string, number> = {}
  for (const file of files) {
    const ext = file.path.split('.').pop()?.toLowerCase() || ''
    for (const [language, exts] of Object.entries(LANGUAGE_EXTENSION_MAP)) {
      if (exts.includes(ext)) {
        counts[language] = (counts[language] || 0) + 1
        break
      }
    }
  }

  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (best && best[1] > 0) {
    return best[0]
  }

  const all = files.map((f) => f.content).join("\n")
  if (/from\s+flask\s+import|Flask\(/.test(all)) return "Python"
  if (/from\s+django\.|urlpatterns\s*=\s*\[/.test(all)) return "Python"
  if (/Rails\.application\.routes\.draw/.test(all)) return "Ruby"
  if (/package\s+main/.test(all) && /func\s+main\(\)/.test(all)) return "Go"
  if (/@RestController|SpringApplication\.run\(/.test(all)) return "Java"
  if (/WebApplication\.CreateBuilder\(|MapGet\(/.test(all)) return "CSharp"
  if (/fun\s+main\(/.test(all) && /val\s+/.test(all)) return "Kotlin"
  if (/import\s+Vapor|Application\(/.test(all)) return "Swift"
  if (/fn\s+main\(\)/.test(all) && /let\s+/.test(all)) return "Rust"
  if (/\bconsole\.log\(|\bimport\s+React|export\s+default/.test(all)) return "JavaScript"

  return "Unknown"
}

export async function POST(request: NextRequest) {
  try {
    const bodyResult = githubImportBodySchema.safeParse(await request.json())
    if (!bodyResult.success) {
      return NextResponse.json({ message: formatZodError(bodyResult.error) }, { status: 400 })
    }
    const { owner, repo, branch, githubToken } = bodyResult.data
    const githubCookieToken = request.cookies.get("github_token")?.value
    const token = githubToken?.trim() || githubCookieToken

    const defaultBranch = branch || await getDefaultBranch(owner, repo, token)
    
    // 1. Fetch Git Tree (all paths instantly)
    const treeUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`
    const treeRes = await fetch(treeUrl, { headers: getGithubHeaders(token) })
    if (!treeRes.ok) {
      if (treeRes.status === 403) throw new Error("Accès GitHub refusé ou limite de taux atteinte")
      throw new Error("Impossible de récupérer l'arborescence du dépôt")
    }
    
    const treeData = await treeRes.json()
    const treePaths: string[] = treeData.tree.filter((t: any) => t.type === "blob").map((t: any) => t.path)

    let framework = "unknown"
    let language = "Unknown"
    let routes: any[] = []
    let port: number | undefined

    // 2. Priority: Package.json parsing
    const packageJsonPath = treePaths.find(p => p === "package.json")
    if (packageJsonPath) {
      const pkgContent = await fetchFileContentRaw(owner, repo, defaultBranch, packageJsonPath, token)
      if (pkgContent) {
        try {
          const pkg = JSON.parse(pkgContent)
          const deps = { ...pkg.dependencies, ...pkg.devDependencies }
          if (deps["next"]) framework = "nextjs"
          else if (deps["@nestjs/core"]) framework = "nestjs"
          else if (deps["express"]) framework = "express"
          else if (deps["fastify"]) framework = "fastify"
          else if (deps["koa"]) framework = "koa"
          
          if (deps["typescript"] || deps["react"] || deps["express"]) language = "JavaScript"
        } catch {}
      }
    }

    // 3. Fast-path: Next.js Routing
    if (framework === "nextjs") {
      routes = detectNextJsRoutesFromTree(treePaths)
    }

    // 4. Fallback: Download files for code analysis
    if (routes.length === 0) {
      // Filter out ignored folders and non route files
      const validPaths = treePaths.filter(p => {
        const parts = p.toLowerCase().split('/')
        if (parts.some(part => IGNORED_FOLDERS.includes(part))) return false
        if (isNonRouteFile(p)) return false
        const ext = p.split('.').pop()?.toLowerCase() || ""
        return new Set(Object.values(LANGUAGE_EXTENSION_MAP).flat()).has(ext)
      })

      const filesToFetch = validPaths.slice(0, MAX_FILES)
      const decodedFiles: { path: string; content: string }[] = []
      
      // Fetch in parallel batches
      const batchSize = 15
      for (let i = 0; i < filesToFetch.length; i += batchSize) {
        const batch = filesToFetch.slice(i, i + batchSize)
        const contents = await Promise.all(batch.map(p => fetchFileContentRaw(owner, repo, defaultBranch, p, token)))
        batch.forEach((p, idx) => {
          if (contents[idx]) decodedFiles.push({ path: p, content: contents[idx]! })
        })
      }

      if (language === "Unknown") language = detectLanguage(decodedFiles)
      if (framework === "unknown") framework = detectFramework(decodedFiles, treePaths)
      routes = detectRoutes(decodedFiles, framework)
      port = detectPort(decodedFiles)
    }

    const payload = {
      name: repo,
      framework,
      language,
      routes,
    }
    const validated = githubImportResponseSchema.safeParse(payload)
    if (!validated.success) {
      return NextResponse.json(
        { message: "Analyse GitHub invalide", details: formatZodError(validated.error) },
        { status: 502 },
      )
    }
    return NextResponse.json({ ...validated.data, port })
  } catch (error) {
    console.error("GitHub import error:", error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    )
  }
}

async function getDefaultBranch(owner: string, repo: string, githubToken?: string): Promise<string> {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: getGithubHeaders(githubToken),
  })
  if (!res.ok) {
    if (res.status === 403) throw new Error("Accès GitHub refusé ou limite de taux atteinte")
    throw new Error("Dépôt non trouvé ou accès refusé")
  }
  const data = await res.json()
  return data.default_branch || "main"
}

async function fetchFileContentRaw(owner: string, repo: string, branch: string, path: string, githubToken?: string): Promise<string | undefined> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
  const res = await fetch(url, { headers: getGithubHeaders(githubToken) })
  if (!res.ok) return undefined
  const item = await res.json()
  if (item.type === "file" && item.content) {
    return Buffer.from(item.content, "base64").toString("utf-8")
  }
  return undefined
}

function detectNextJsRoutesFromTree(paths: string[]): any[] {
  const routes: any[] = []
  for (const p of paths) {
    let match = p.match(/(?:^|\/)app\/api\/(.+)\/route\.(ts|js|mjs)$/)
    if (match) {
      routes.push({ method: "ALL", path: `/api/${match[1]}`, sourceFile: p, authRequired: false })
      continue
    }
    match = p.match(/(?:^|\/)pages\/api\/(.+)\.(ts|js|mjs)$/)
    if (match) {
      let path = `/api/${match[1]}`
      if (path.endsWith("/index")) path = path.replace(/\/index$/, "")
      routes.push({ method: "ALL", path, sourceFile: p, authRequired: false })
    }
  }
  return routes
}

function detectFramework(files: { path: string; content: string }[], treePaths: string[] = []): string {
  const allContent = files.map(f => f.content).join("\n")
  const pathsStr = treePaths.join("\n")
  
  if (/next\.config\.(js|ts|mjs)/.test(pathsStr) || /from\s+['"]next\//.test(allContent)) return "nextjs"
  if (/from\s+['"]express['"]|require\s*\(\s*['"]express['"]\s*\)|express\s*\(\s*\)|app\.get\(|router\.get\(/.test(allContent)) return "express"
  if (/from\s+['"]fastify['"]|fastify\s*\(/.test(allContent)) return "fastify"
  if (/@nestjs\/|@Controller/.test(allContent)) return "nestjs"
  if (/from\s+fastapi\s+import|FastAPI\s*\(/.test(allContent)) return "fastapi"
  if (/from\s+flask\s+import|Flask\s*\(/.test(allContent)) return "flask"
  if (/from\s+django\.|urlpatterns\s*=\s*\[/.test(allContent)) return "django"
  if (/Rails\.application\.routes\.draw/.test(allContent)) return "rails"
  if (/(?:@RestController|@GetMapping|@PostMapping)/.test(allContent)) return "spring"
  if (/WebApplication\.CreateBuilder\(|MapGet\(|app\.MapControllers/.test(allContent)) return "aspnet"
  if (/package\s+main/.test(allContent) && (/func\s+main\(\)|http\.HandleFunc|mux\.HandleFunc/.test(allContent))) return "go"
  if (/Route::/.test(allContent)) return "laravel"
  
  return "unknown"
}

function detectRoutes(files: { path: string; content: string }[], framework: string): any[] {
  const routes: any[] = []
  
  const EXPRESS_PATTERNS = [
    /app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"\s][^'"\)]*)['"]/g,
    /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"\s][^'"\)]*)['"]/g,
  ]
  const FASTAPI_PATTERNS = [
    /@router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"\s][^'"\)]*)['"]/g,
    /@app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"\s][^'"\)]*)['"]/g,
  ]
  const FLASK_PATTERNS = [
    /@?app\.route\s*\(\s*['"]([^'"\s][^'"\)]*)['"],?\s*methods\s*=\s*\[([^\]]+)\]/g,
    /@?app\.route\s*\(\s*['"]([^'"\s][^'"\)]*)['"]\s*\)/g,
  ]
  const DJANGO_PATTERNS = [
    /path\(\s*['"]([^'"\s][^'"\)]*)['"],/g,
    /re_path\(\s*['"]([^'"\s][^'"\)]*)['"],/g,
  ]
  const NESTJS_PATTERNS = [
    /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"]([^'"\s][^'"\)]*)['"]/g,
  ]
  
  const frameworks: Record<string, RegExp[]> = {
    express: EXPRESS_PATTERNS,
    fastapi: FASTAPI_PATTERNS,
    flask: FLASK_PATTERNS,
    django: DJANGO_PATTERNS,
    nestjs: NESTJS_PATTERNS,
  }

  const patterns = frameworks[framework] || [...EXPRESS_PATTERNS, ...FASTAPI_PATTERNS, ...FLASK_PATTERNS, ...DJANGO_PATTERNS, ...NESTJS_PATTERNS]
  
  for (const file of files) {
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(file.content)) !== null) {
        const method = (match[1] || "GET").toUpperCase()
        const path = match[2] || ""
        let authRequired = false

        if (/(\/(admin|dashboard|profile|settings|account|private|protected|user\/[^/]+|me|secure)(?:\/|$))/i.test(path)) {
          authRequired = true
        }

        if (!authRequired) {
          try {
            const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const pat = new RegExp(`\\.${method.toLowerCase()}\\s*\\(\\s*['"\`]${escapedPath}['"\`]\\s*,([\\s\\S]{0,500}?)\\)`, "i")
            const mm = file.content.match(pat)
            if (mm) {
              const rawArgs = mm[1] || ""
              if (/passport\.authenticate|ensureauth|requireauth|verifyjwt|verifytoken|authenticatejwt|authguard|checkauth|isauth\b|auth\s*\(|login_required|permission_required/i.test(rawArgs) ||
                  /\b401\b|\b403\b|Unauthorized|Forbidden/i.test(rawArgs)) {
                authRequired = true
              }
            }
          } catch {}
        }

        routes.push({
          method,
          path,
          sourceFile: file.path,
          authRequired
        })
      }
    }
  }
  
  return deduplicate(routes)
}

function deduplicate(routes: any[]): any[] {
  const seen = new Set<string>()
  return routes.filter(r => {
    const key = `${r.method}|${r.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function detectPort(files: { path: string; content: string }[]): number | undefined {
  const all = files.map(f => f.content).join("\n")
  const match = all.match(/\.listen\(\s*(\d+)/) || all.match(/port\s*[:=]\s*(\d+)/)
  return match ? parseInt(match[1]) : undefined
}