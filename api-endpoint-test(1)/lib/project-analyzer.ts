"use client"

import path from "path"
import type { AIProvider, DetectedRoute, SavedProject, AnalysisMode } from "@/hooks/use-projects-store"
import { loadOllamaConfig } from "@/hooks/use-projects-store"
import { readDir, readTextFile } from "@tauri-apps/plugin-fs"

declare const require: any

// ── Extension maps ────────────────────────────────────────────────────────

const FRAMEWORK_FILE_EXTENSIONS: Record<string, string[]> = {
  fastapi: [".py"],
  flask: [".py"],
  django: [".py"],
  express: [".js", ".ts", ".jsx", ".tsx"],
  nextjs: [".js", ".ts", ".jsx", ".tsx"],
  nestjs: [".js", ".ts"],
  laravel: [".php"],
  rails: [".rb"],
  spring: [".java", ".kt"],
  aspnet: [".cs"],
  go: [".go"],
  fastify: [".js", ".ts"],
  hapi: [".js", ".ts"],
  koa: [".js", ".ts"],
  rust: [".rs"],
  swift: [".swift"],
  elixir: [".ex", ".exs"],
  haskell: [".hs"],
  micronaut: [".java", ".kt"],
  quarkus: [".java", ".kt"],
  tornado: [".py"],
  sanic: [".py"],
  starlette: [".py"],
  litestar: [".py"],
  aiohttp: [".py"],
  falcon: [".py"],
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
  Elixir: ["ex", "exs"],
  Haskell: ["hs"],
}

function isRelevantFile(filePath: string, framework: string): boolean {
  if (framework === "unknown") return true
  const exts = FRAMEWORK_FILE_EXTENSIONS[framework]
  if (!exts) return true
  return exts.includes(path.extname(filePath).toLowerCase())
}

function detectLanguage(files: { path: string; content: string }[]): string {
  const counts: Record<string, number> = {}
  for (const file of files) {
    const ext = path.extname(file.path).replace(".", "").toLowerCase()
    for (const [language, exts] of Object.entries(LANGUAGE_EXTENSION_MAP)) {
      if (exts.includes(ext)) {
        counts[language] = (counts[language] || 0) + 1
        break
      }
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (sorted.length > 0 && sorted[0][1] > (sorted[1]?.[1] ?? 0)) return sorted[0][0]
  const all = files.map((f) => f.content).join("\n")
  const sanitized = stripLanguageCommentsAndStrings(all)
  
  // Python frameworks
  if (/from\s+fastapi\s+import|FastAPI\(|@app\.get|@router\.post/.test(all)) return "Python"
  if (/from\s+flask\s+import|@app\.route|Flask\(/.test(all)) return "Python"
  if (/from\s+django\.|from\s+rest_framework|urlpatterns\s*=\s*\[|@login_required/.test(all)) return "Python"
  if (/from\s+tornado\.web|RequestHandler/.test(all)) return "Python"
  if (/from\s+sanic\.|Sanic\(|from\s+litestar\.|Litestar\(|from\s+starlette\.|uvicorn\.|asgi\//.test(all)) return "Python"
  
  // Ruby
  if (/Rails\.application\.routes\.draw|class.*<\s*ApplicationController|def\s+create/.test(all)) return "Ruby"
  if (/Sinatra::|get\s+['"]\//.test(all)) return "Ruby"
  
  // Go
  if (/package\s+main/.test(all) && (/func\s+main\(\)|http\.HandleFunc|mux\.HandleFunc|router\.GET/.test(all))) return "Go"
  if (/gin\.|echo\.|fiber\.|chi\./.test(all)) return "Go"
  
  // Java/Spring
  if (/(?:@RestController|@RequestMapping|@GetMapping|@PostMapping|@PutMapping|@DeleteMapping)/.test(sanitized) && /(?:org\.springframework|spring\.boot\.)/.test(sanitized)) return "Java"
  if (/@SpringBootApplication|spring\.boot\./.test(sanitized)) return "Java"

  // Quarkus / Micronaut
  if (/(?:io\.micronaut\.|@MicronautApplication|micronaut\.http\.|@Controller\(|@(Get|Post|Put|Delete|Patch)\b)/.test(sanitized) && /(?:io\.micronaut\.|micronaut\.)/.test(sanitized)) return "Java"
  if (/(?:io\.quarkus\.|quarkus\.|@QuarkusMain|@Path\(|(?:javax|jakarta)\.ws\.rs\.)/.test(sanitized)) return "Java"
  
  // C#/.NET
  if (/WebApplication\.CreateBuilder\(|MapGet\(|MapPost\(|app\.MapControllers|namespace.*Microsoft/.test(all)) return "CSharp"
  if (/\.NET|ASP\.NET|IActionResult|[Cc]ontroller\s*:\s*Controller/.test(all)) return "CSharp"
  
  // Kotlin
  if (/fun\s+main\(/.test(all) && /val\s+|var\s+/.test(all) && /object|class/.test(all)) return "Kotlin"
  if (/ktor\.|routing\s*\{/.test(all)) return "Kotlin"
  
  // Swift
  if (/import\s+Vapor|Application\(|app\.http/.test(all)) return "Swift"
  if (/func\s+routes\(|router\.get|AsyncHTTPServer/.test(all)) return "Swift"
  
  // Rust
  if (/fn\s+main\(\)|use\s+axum|use\s+actix|use\s+rocket|axum::|actix_web::|rocket::/.test(all)) return "Rust"
  if (/#\[tokio::main\]|#\[actix_web::|#\[rocket::main\]/.test(all)) return "Rust"
  
  // PHP/Laravel
  if (/Route::|Laravel|Illuminate|app\/Http\/Controllers/.test(all)) return "PHP"
  if (/@php\/framework|<?php|function\s+store\(Request/.test(all)) return "PHP"
  
  // JavaScript/TypeScript (Node/Express/Next)
  if (/\bconsole\.log\(|\bimport\s+React|export\s+default|require\(/.test(sanitized)) return "JavaScript"
  if (/from\s+['"](express|next|fastify|koa)['"]|app\.get\(|app\.post\(/.test(sanitized)) return "JavaScript"

  // Elixir
  if (/mix\.exs|Phoenix\.Router|use\s+Phoenix|plug\.|phoenix\./i.test(all)) return "Elixir"

  // Haskell
  if (/import\s+Network\.Wai|import\s+Servant|servant-server|warp\.|wai\./i.test(all)) return "Haskell"
  
  return "Unknown"
}

// ── Constants ─────────────────────────────────────────────────────────────

const IGNORED_FOLDERS = [
  "node_modules", ".git", ".next", "dist", "build", "out",
  "__pycache__", ".venv", "venv", "env", "vendor", ".turbo",
  "coverage", ".cache", "storybook-static", ".husky",
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

const MAX_FILES = 200

// ── Public API ───────────────────────────────────────────────────────────

export async function analyzeProject(
  folderPath: string,
  mode: AnalysisMode,
  provider?: AIProvider,
  apiKey?: string,
): Promise<SavedProject> {
  if (mode === "ai") {
    if (provider !== "ollama" && !apiKey) throw new Error("Clé API requise pour l'analyse IA")
    return analyzeWithAI(folderPath, provider ?? "openai", apiKey)
  }
  return analyzeStatic(folderPath)
}

// ── Static analysis ──────────────────────────────────────────────────────

async function analyzeStatic(folderPath: string): Promise<SavedProject> {
  const filePaths = await getFiles(folderPath)
  const files: { path: string; content: string }[] = []
  const routes: DetectedRoute[] = []

  for (const fp of filePaths) {
    try {
      const content = await readTextFile(fp)
      files.push({ path: fp, content })
    } catch { /* skip unreadable file */ }
  }

  const filteredFiles = files.filter((f) => !isNonRouteFile(f.path))

  // ── Project-level auth indicators ────────────────────────────────────
  const projectAuthIndicators = {
    hasPassport: false,
    hasJsonWebToken: false,
    hasCookieAccess: false,
    hasSession: false,
    hasNextAuth: false,
    hasClerk: false,
    hasSupabaseAuth: false,
    hasFirebaseAuth: false,
  }
  for (const f of files) {
    const c = f.content
    if (/\bpassport\b/.test(c)) projectAuthIndicators.hasPassport = true
    if (/\bjsonwebtoken\b|\bjwt\.verify\b|\bjwt\.sign\b/.test(c)) projectAuthIndicators.hasJsonWebToken = true
    if (/request\.cookies|NextResponse\.cookie|response\.cookies|cookies\.get\(|cookies\.set\(/.test(c)) projectAuthIndicators.hasCookieAccess = true
    if (/\.session\b|req\.session|session\[|express-session/.test(c)) projectAuthIndicators.hasSession = true
    if (/next-auth|NextAuth|getServerSession|getSession|useSession/.test(c)) projectAuthIndicators.hasNextAuth = true
    if (/@clerk\/|useAuth\(\)|currentUser\(\)|auth\(\)/.test(c)) projectAuthIndicators.hasClerk = true
    if (/supabase.*auth|createClient.*supabase/.test(c)) projectAuthIndicators.hasSupabaseAuth = true
    if (/firebase\/auth|signInWith|onAuthStateChanged/.test(c)) projectAuthIndicators.hasFirebaseAuth = true
  }

  const language = detectLanguage(filteredFiles)
  const framework = detectFramework(filteredFiles)
  const relevantFiles = filteredFiles.filter(
    (f) => isRelevantFile(f.path, framework)
  )

  // ── Prefix map for FastAPI include_router ────────────────────────────
  const prefixMap: Record<string, string> = {}
  const INCLUDE_ROUTER_RE = /include_router\s*\(\s*([A-Za-z0-9_.]+)\s*,\s*prefix\s*[:=]\s*['"]([^'"]+)['"]/g
  const APIRouter_RE = /([A-Za-z_][\w]*)\s*=\s*APIRouter\s*\(\s*[^\)]*prefix\s*[:=]\s*['"]([^'"]+)['"][^\)]*\)/g
  for (const f of relevantFiles) {
    let m
    INCLUDE_ROUTER_RE.lastIndex = 0
    while ((m = INCLUDE_ROUTER_RE.exec(f.content)) !== null) {
      const ident = (m[1] || "").split('.')[0]
      const pref = m[2] || ""
      if (ident && pref) prefixMap[ident] = pref
    }
    APIRouter_RE.lastIndex = 0
    while ((m = APIRouter_RE.exec(f.content)) !== null) {
      const ident = m[1]
      const pref = m[2] || ""
      if (ident && pref) prefixMap[ident] = pref
    }
  }

  // ── NestJS Controller prefix map ──────────────────────────────────────
  // @Controller('users') → all routes in this file have prefix /users
  const nestjsControllerPrefixByFile: Record<string, string> = {}
  for (const f of relevantFiles) {
    const m = f.content.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"` `]/)
    if (m) nestjsControllerPrefixByFile[f.path] = normalizePath(m[1])
  }

  // ── Import & local def resolution ────────────────────────────────────
  const importsByFile: Record<string, Record<string, ImportInfo>> = {}
  const localDefinitionsByFile: Record<string, Set<string>> = {}
  for (const f of relevantFiles) {
    importsByFile[f.path] = parseImports(f.content)
    localDefinitionsByFile[f.path] = parseLocalDefinitions(f.content)
  }

  // ── app.use / router.use mount detection ─────────────────────────────
  const routerMounts: Record<string, { prefix?: string; middlewares: string[] }> = {}
  const pathMiddlewares: Record<string, string[]> = {}
  const appMiddlewares: string[] = []

  for (const f of relevantFiles) {
    parseAppUse(f.content, f.path, importsByFile, localDefinitionsByFile, routerMounts, pathMiddlewares, appMiddlewares)
  }

  // ── Detect routes per file ────────────────────────────────────────────
  const seen = new Set<string>()

  for (const f of relevantFiles) {
    // Apply NestJS controller prefix at file level
    const nestPrefix = nestjsControllerPrefixByFile[f.path]

    // Apply FastAPI include_router / APIRouter prefix by router variable name
    const detected = detectRoutes(f.content, f.path, framework)

    for (const r of detected) {
      if (nestPrefix) {
        r.path = normalizePath(`${nestPrefix}/${r.path}`)
      }
      const fastapiPrefix = r.controller && prefixMap[r.controller as string]
      if (fastapiPrefix) {
        r.path = normalizePath(`${fastapiPrefix}/${r.path}`)
      }

      const key = `${r.method}|${r.path}`
      if (seen.has(key)) continue
      seen.add(key)
      r.sourceFile = f.path
      routes.push(r)
    }
  }

  // ── Next.js App Router (app/api/**/route.*) ───────────────────────────
  for (const f of relevantFiles) {
    const detected = detectNextjsAppRouter(f)
    for (const r of detected) {
      const key = `${r.method}|${r.path}`
      if (seen.has(key)) continue
      seen.add(key)
      routes.push(r)
    }
  }

  // ── Next.js Pages Router (pages/api/**) ──────────────────────────────
  for (const f of relevantFiles) {
    const detected = detectNextjsPagesRouter(f)
    for (const r of detected) {
      const key = `${r.method}|${r.path}`
      if (seen.has(key)) continue
      seen.add(key)
      routes.push(r)
    }
  }

  // ── Strengthen auth via import resolution ─────────────────────────────
  for (const r of routes) {
    if (r.authRequired) continue
    const fp = r.sourceFile
    if (!fp) continue
    const candidates = [
      ...(r.middlewareChain || []),
      typeof r.controller === "string" ? r.controller : undefined,
    ].filter(Boolean) as string[]

    if (candidates.some((id) => isAuthMiddleware(id, fp, importsByFile, localDefinitionsByFile))) {
      r.authRequired = true
      r.authType = r.authType || "middleware"
      r.reasonings?.push("Auth helper détecté via import/définition locale")
    }

    // Project-wide auth hint: if next-auth is used globally, routes returning getServerSession are protected
    if (!r.authRequired && fp) {
      const content = filteredFiles.find((ff) => ff.path === fp)?.content || ""
      if (projectAuthIndicators.hasNextAuth && /getServerSession|getSession|auth\(\)/.test(content)) {
        r.authRequired = true
        r.authType = "cookie"
        r.reasonings?.push("NextAuth getServerSession détecté dans le handler")
      }
      if (projectAuthIndicators.hasClerk && /currentUser\(\)|auth\(\)|clerkClient/.test(content)) {
        r.authRequired = true
        r.authType = "middleware"
        r.reasonings?.push("Clerk auth détecté dans le handler")
      }
      if (projectAuthIndicators.hasSupabaseAuth && /supabase\.auth\.getUser|supabase\.auth\.getSession/.test(content)) {
        r.authRequired = true
        r.authType = "cookie"
        r.reasonings?.push("Supabase auth.getUser/getSession détecté")
      }
    }
  }

  // ── Propagate mounts/middlewares to routes ────────────────────────────
  for (const r of routes) {
    try {
      const ctrl = (r.controller || "") as string
      if (ctrl && routerMounts[ctrl]) {
        const mount = routerMounts[ctrl]
        if (mount.prefix) r.path = normalizePath(`${mount.prefix}/${r.path}`)
        if (mount.middlewares?.length) {
          r.middlewareChain = [...mount.middlewares, ...(r.middlewareChain || [])]
          if (mount.middlewares.some((m) => isAuthLikeName(m))) {
            r.authRequired = true
            r.authType = r.authType || "middleware"
            r.reasonings?.push("Auth middleware hérité du mount router")
          }
        }
      }

      for (const pfx of Object.keys(pathMiddlewares)) {
        if (r.path.startsWith(pfx)) {
          r.middlewareChain = [...(pathMiddlewares[pfx] || []), ...(r.middlewareChain || [])]
          if ((pathMiddlewares[pfx] || []).some((m) => isAuthLikeName(m))) {
            r.authRequired = true
            r.authType = r.authType || "middleware"
            r.reasonings?.push(`Auth middleware hérité du path ${pfx}`)
          }
        }
      }

      if (appMiddlewares.length) {
        r.middlewareChain = [...appMiddlewares, ...(r.middlewareChain || [])]
        if (appMiddlewares.some((m) => isAuthLikeName(m))) {
          r.authRequired = true
          r.authType = r.authType || "middleware"
          r.reasonings?.push("Auth middleware global (app.use) appliqué")
        }
      }
    } catch {}
  }

  // ── Frontend API call scanning ────────────────────────────────────────
  const calledPaths = scanFrontendApiCalls(filteredFiles)
  const fileContentByPath: Record<string, string> = Object.fromEntries(
    relevantFiles.map((f) => [f.path, f.content])
  )

  // ── Final confidence + frontend usage correlation ─────────────────────
  for (const r of routes) {
    const content = fileContentByPath[r.sourceFile] || ""

    // Infer auth from path and name
    if (!r.authRequired) {
      const inference = inferAuthFromPathAndName(r.path, r.name)
      if (inference.required) {
        r.authRequired = true
        if (!r.authType) {
          const allowed = ["none","bearer","basic","oauth","api-key","jwt","session","custom","middleware","cookie","passport"] as DetectedRoute['authType'][]
          if (inference.type && allowed.includes(inference.type)) {
            r.authType = inference.type
          } else {
            r.authType = "middleware"
          }
        }
        r.reasonings?.push(`Route patterns indiquent une protection: ${r.path}`)
      }
    }

    // Re-check auth patterns inline near route declaration
    if (!r.authRequired) {
      try {
        const escapedPath = escapeRegExpStr(r.path)
        const pat = new RegExp(
          `([A-Za-z_$][\\w$]*)\\.${r.method.toLowerCase()}\\s*\\(\\s*['"\`]${escapedPath}['"\`]\\s*,([\\s\\S]{0,2000}?)\\)`,
          "i"
        )
        const mm = content.match(pat)
        if (mm) {
          const rawArgs = mm[2] || ""
          const rawLower = rawArgs.toLowerCase()
          if (
            /passport\.authenticate|ensureauth|requireauth|verifyjwt|verifytoken|authenticatejwt|authguard|checkauth|isauth\b|auth\s*\(|login_required|permission_required|userrequired|adminonly|rolesrequired/.test(rawLower) ||
            /\b401\b|\b403\b|Unauthorized|Forbidden|NotAuthenticated|NotAuthorized/.test(rawArgs)
          ) {
            r.authRequired = true
            r.authType = r.authType || "middleware"
            r.reasonings?.push("Auth détecté dans la déclaration inline de la route")
          }
        }
      } catch {}
    }

    // Frontend correlation
    for (const called of calledPaths) {
      if (correlateWithFrontendCall(r.path, called)) {
        r.actuallyUsedByFrontend = true
        r.reasonings?.push(`Référencé par appel frontend: ${called}`)
        break
      }
    }

    // Confidence scoring
    let score = 0
    if (r.authRequired) score += 3
    if (r.actuallyUsedByFrontend) score += 2
    if (r.bodyType && r.bodyType !== "none") score += 1
    if ((r.middlewareChain || []).length > 0) score += 1
    if ((r.reasonings || []).length > 1) score += 1

    r.confidence = score >= 5 ? "HIGH" : score >= 2 ? "MEDIUM" : "LOW"
  }

  return {
    id: `proj-${Date.now()}`,
    name: deriveName(folderPath),
    framework,
    language,
    folderPath,
    port: detectPort(files) ?? defaultPortForFramework(framework),
    routes,
    analyzedAt: new Date().toISOString(),
    mode: "static",
  }
}

// ── Framework detection ───────────────────────────────────────────────────

interface FileInfo {
  path: string
  content: string
}

function detectFramework(files: FileInfo[]): string {
  if (files.length === 0) return "unknown"
  const all = files.map((f) => f.content).join("\n")
  const paths = files.map((f) => f.path.replace(/\\/g, "/")).join("\n")
  const sanitized = stripLanguageCommentsAndStrings(all)

  // Next.js (must come before Express)
  if (/next\.config\.(js|ts|mjs)/.test(paths) || /from\s+['"]next\//.test(all) || /next\/(?:server|router|link)/.test(all)) return "nextjs"

  // Node.js frameworks
  if (/require\s*\(\s*['"]express['"]\s*\)|express\s*\(\s*\)|app\.get\(|app\.post\(|router\.(?:get|post|put|delete)/.test(sanitized)) return "express"
  if (/from\s+['"]fastify['"]|fastify\s*\(|fastify\.(?:get|post|put|delete)/.test(sanitized)) return "fastify"
  if (/from\s+['"]koa|new\s+Koa\(/.test(sanitized)) return "koa"
  if (/@hapi\/hapi|Hapi\.server\(|server\.start\(|server\.route\(|\bhapi\./.test(sanitized)) return "hapi"
  if (/fastify\.|from\s+['"]fastify['"]/.test(sanitized)) return "fastify"

  // NestJS
  if (/@nestjs\/|@Controller|@Get\(|@Post\(|@UseGuards|@UseMiddleware/.test(all)) return "nestjs"

  // Python
  if (/from\s+fastapi\s+import|FastAPI\s*\(|@app\.(?:get|post|put|delete|patch)|@router\.(?:get|post|put|delete|patch)/.test(all)) return "fastapi"
  if (/from\s+flask\s+import|@(?:[A-Za-z_][\w.]*\.)?(?:route|get|post|put|delete|patch)\s*\(|Flask\s*\(/.test(all)) return "flask"
  if (/from\s+django|from\s+rest_framework|urlpatterns\s*=\s*\[|@login_required|@permission_required|@staff_member_required|@user_passes_test/.test(all)) return "django"
  if (/from\s+tornado\.web|RequestHandler\b/.test(all)) return "tornado"
  if (/from\s+litestar\.|from\s+starlite\.|Litestar\(|Starlite\(/.test(all)) return "litestar"
  if (/from\s+starlette\.|Route\s*\(|Mount\s*\(|asgi\//.test(all)) return "starlette"
  if (/from\s+sanic\.|Sanic\(/.test(all)) return "sanic"
  if (/from\s+aiohttp\.|aiohttp\.web\.Application|app\.router\.add_(?:get|post|put|delete|patch|route)\s*\(/.test(all)) return "aiohttp"
  if (/from\s+falcon|falcon\.API|app\.add_route\s*\(|\bon_(?:get|post|put|patch|delete)\b/.test(all)) return "falcon"

  // Ruby
  if (/Rails\.application\.routes\.draw|class\s+\w+\s*<\s*ApplicationController/.test(all)) return "rails"
  if (/Sinatra::|get\s+['"]\//.test(all)) return "sinatra"

  // Elixir / Phoenix
  if (/mix\.exs/.test(paths) || /Phoenix\.Router|use\s+Phoenix|plug\.|phoenix\./.test(all)) return "phoenix"

  // Java / Spring
  if (/(?:@RestController|@RequestMapping|@GetMapping|@PostMapping|@PutMapping|@DeleteMapping)/.test(sanitized) && /(?:org\.springframework|spring\.boot\.)/.test(sanitized)) return "spring"

  // Quarkus / Micronaut
  if (/(?:io\.micronaut\.|@MicronautApplication|micronaut\.http\.|@Controller\(|@(Get|Post|Put|Delete|Patch)\b)/.test(sanitized) && /(?:io\.micronaut\.|micronaut\.)/.test(sanitized)) return "micronaut"
  if (/(?:io\.quarkus\.|quarkus\.|@QuarkusMain|@Path\(|(?:javax|jakarta)\.ws\.rs\.)/.test(sanitized)) return "quarkus"
  if (/(?:@RestController|@Controller|@GetMapping|@PostMapping|@PutMapping|@DeleteMapping)/.test(sanitized)) return "spring"

  // .NET / ASP.NET
  if (/WebApplication\.CreateBuilder\(|MapGet\(|MapPost\(|app\.MapControllers|namespace.*Microsoft\.AspNetCore/.test(sanitized)) return "aspnet"

  // Go
  if (/package\s+main/.test(all) && (/func\s+main\(\)|http\.HandleFunc|mux\.HandleFunc/.test(all))) return "go"
  if (/gin\.|echo\.|fiber\.|chi\./.test(all) && /func\s+main\(\)/.test(all)) return "go"

  // Kotlin
  if (/fun\s+main\(/.test(all) && /val\s+|var\s+/.test(all) && /ktor\.|routing\s*\{/.test(all)) return "kotlin"

  // Swift
  if (/import\s+Vapor|Application\(|app\.http|Vapor\.|routes\(|router\.get/.test(all)) return "swift"

  // Rust
  if (/fn\s+main\(\)|#\[tokio::main\]|use\s+(?:axum|actix|rocket)|axum::|actix_web::|rocket::/.test(all)) return "rust"

  // Haskell (Servant)
  if (/import\s+Network\.Wai|import\s+Servant|servant-server|warp::|wai::/.test(all)) return "haskell"

  // Laravel / PHP
  if (/Route::|Laravel|Illuminate|app\/Http\/Controllers/.test(all)) return "laravel"

  return "unknown"
}

// ── Default ports ─────────────────────────────────────────────────────────

function defaultPortForFramework(framework: string): number | undefined {
  const ports: Record<string, number> = {
    fastapi: 8000, flask: 5000, django: 8000,
    express: 3000, nextjs: 3000, nestjs: 3000,
    laravel: 8000, rails: 3000,
    spring: 8080, quarkus: 8080, micronaut: 8080, aspnet: 5000, go: 8080,
  }
  return ports[framework]
}

function stripLanguageCommentsAndStrings(code: string): string {
  return code
    .replace(/('{3}|"{3})[\s\S]*?\1/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/#.*$/gm, " ")
    .replace(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, " ")
}

// ── Recursive file walker ─────────────────────────────────────────────────

async function getFiles(folderPath: string, depth = 0): Promise<string[]> {
  if (depth > 8) return []
  const results: string[] = []
  try {
    const entries = await readDir(folderPath)
    for (const entry of entries) {
      if (results.length >= MAX_FILES) break
      if (shouldSkip(entry.name)) continue
      if (entry.isDirectory) {
        results.push(...(await getFiles(`${folderPath}/${entry.name}`, depth + 1)))
      } else if (entry.isFile) {
        results.push(`${folderPath}/${entry.name}`)
      }
      if (results.length >= MAX_FILES) break
    }
  } catch (err) {
    if (depth === 0) throw err
  }
  return results
}

function shouldSkip(name: string): boolean {
  if (name.startsWith(".")) return true
  return IGNORED_FOLDERS.includes(name.toLowerCase())
}

function isNonRouteFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase()
  return NON_ROUTE_PATH_SEGMENTS.some((segment) => normalized.includes(segment))
}

function deriveName(folderPath: string): string {
  return folderPath.split(/[/\\]/).filter(Boolean).pop() ?? "Projet"
}

// ── Port detection ─────────────────────────────────────────────────────────

const PORT_PATTERNS: RegExp[] = [
  /\.listen\(\s*(\d{4,5})(?:\s*,|\s*\))/,
  /\.listen\(\s*process\.env\.PORT\s*\|\|\s*(\d{4,5})(?:\s*,|\s*\))/,
  /process\.env\.PORT\s*\|\|\s*(\d{4,5})/,
  /uvicorn\.run\([\s\S]*?port\s*[:=]\s*(\d{4,5})/,
  /app\.run\([\s\S]*?port\s*[:=]\s*(\d{4,5})/,
  /PORT\s*=\s*(\d{4,5})/,
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

// ── Import & definition parsing ──────────────────────────────────────────

type ImportInfo = {
  importedName: string
  source: string
  isNamespace: boolean
  isDefault: boolean
}

function parseImports(content: string): Record<string, ImportInfo> {
  const imports: Record<string, ImportInfo> = {}

  // ES Modules
  for (const m of content.matchAll(/import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const specifier = m[1].trim()
    const source = m[2].trim()
    if (specifier.startsWith("{")) {
      for (const named of specifier.slice(1, -1).split(",")) {
        const [orig, alias] = named.split(" as ").map((s) => s.trim())
        if (orig) imports[alias || orig] = { importedName: orig, source, isNamespace: false, isDefault: false }
      }
    } else if (specifier.startsWith("* as ")) {
      const alias = specifier.replace("* as ", "").trim()
      imports[alias] = { importedName: "*", source, isNamespace: true, isDefault: false }
    } else {
      imports[specifier] = { importedName: "default", source, isNamespace: false, isDefault: true }
    }
  }

  // CommonJS
  for (const m of content.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    imports[m[1]] = { importedName: "*", source: m[2], isNamespace: true, isDefault: true }
  }
  for (const m of content.matchAll(/const\s*\{\s*([^}]+)\s*\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const source = m[2].trim()
    for (const named of m[1].split(",")) {
      const [orig, alias] = named.split(" as ").map((s) => s.trim())
      if (orig) imports[alias || orig] = { importedName: orig, source, isNamespace: false, isDefault: false }
    }
  }

  return imports
}

function parseLocalDefinitions(content: string): Set<string> {
  const defs = new Set<string>()
  for (const m of content.matchAll(/(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defs.add(m[1])
  for (const m of content.matchAll(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|[A-Za-z_$][\w$]*)/g)) defs.add(m[1])
  return defs
}

// ── Auth detection helpers ────────────────────────────────────────────────

const AUTH_IDENTIFIER_RE = /\b(?:auth|passport|jwt|session|verify|authenticate|ensureauth|requireauth|isauthenticated|oauth|token|github_token|access_token|api_key|bearer|authorization|withauth|protect|guard|secured|getserversession|currentuser|clerkauth|supabaseauth|login|signin|validatetoken|checkauth|authguard|authmiddleware|permissionguard|rolecheck|verifyjwt)\b/i
const PROTECTED_ROUTE_RE = /(?:private|protected|secure|admin|authenticated|restricted|member\-only)/i
const PUBLIC_ROUTE_RE = /(?:public|open|guest|anonymous|free|unrestricted)/i

function isAuthLikeName(s: string): boolean {
  return AUTH_IDENTIFIER_RE.test(s)
}

function isAuthIdentifier(identifier: string): boolean {
  return AUTH_IDENTIFIER_RE.test(identifier)
}

function isImportAuth(
  identifier: string,
  filePath: string,
  importsByFile: Record<string, Record<string, ImportInfo>>
): boolean {
  const info = importsByFile[filePath]?.[identifier]
  if (!info) return false
  return /(?:passport|jsonwebtoken|jwt|next-auth|nextauth|auth|oauth|token|jose|argon2|bcrypt|crypto|clerk|supabase|firebase|auth0|okta|cognito|oidc)/i.test(info.source)
}

function isAuthMiddleware(
  token: string,
  filePath: string,
  importsByFile: Record<string, Record<string, ImportInfo>>,
  localDefinitionsByFile: Record<string, Set<string>>
): boolean {
  if (isAuthIdentifier(token)) return true
  if (isImportAuth(token, filePath, importsByFile)) return true
  if (localDefinitionsByFile[filePath]?.has(token) && isAuthIdentifier(token)) return true
  return false
}

function inferAuthFromPathAndName(routePath: string, routeName: string): { required: boolean; type?: DetectedRoute['authType'] } {
  const lowerPath = routePath.toLowerCase()
  const lowerName = routeName.toLowerCase()
  
  // Path patterns that indicate auth requirement
  if (/(\/(admin|dashboard|profile|settings|account|private|protected|user\/[^/]+|me|secure)(?:\/|$))/i.test(routePath)) {
    return { required: true, type: "middleware" }
  }
  
  // Path patterns that indicate public access
  if (/(\/(login|signup|register|forgot-password|public|health|status|ping|docs|swagger)(?:\/|$))/i.test(routePath)) {
    return { required: false }
  }
  
  // Name/description patterns
  if (PROTECTED_ROUTE_RE.test(routeName + lowerPath)) {
    return { required: true, type: "middleware" }
  }
  if (PUBLIC_ROUTE_RE.test(routeName + lowerPath)) {
    return { required: false }
  }
  
  return { required: false }
}

// ── Argument splitter ─────────────────────────────────────────────────────

function splitTopLevelArgs(s: string): string[] {
  const parts: string[] = []
  let cur = ""
  let depth = 0
  let inQuote: string | null = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuote) {
      cur += ch
      if (ch === inQuote && s[i - 1] !== "\\") inQuote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === "`") { inQuote = ch; cur += ch; continue }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; cur += ch; continue }
    if (ch === ")" || ch === "]" || ch === "}") { depth--; cur += ch; continue }
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; continue }
    cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

// ── app.use / router.use parsing ─────────────────────────────────────────

function parseAppUse(
  content: string,
  filePath: string,
  importsByFile: Record<string, Record<string, ImportInfo>>,
  localDefinitionsByFile: Record<string, Set<string>>,
  routerMounts: Record<string, { prefix?: string; middlewares: string[] }>,
  pathMiddlewares: Record<string, string[]>,
  appMiddlewares: string[]
): void {
  const USE_RE = /([A-Za-z_$][\w$]*)\.use\s*\(\s*([\s\S]*?)\)/g
  for (const m of content.matchAll(USE_RE)) {
    const callee = m[1]
    const inner = m[2]
    const args = splitTopLevelArgs(inner)
    if (args.length === 0) continue

    const first = args[0]
    let pathArg: string | undefined
    let rest = args.slice(1)
    if (/^['"`]/.test(first)) {
      pathArg = first.replace(/^['"`]|['"`]$/g, "")
    } else {
      rest = args
    }

    for (const token of rest) {
      const id = token.split(/[\s(.[]/)[0]
      if (!id) continue
      const isAuth = isAuthMiddleware(id, filePath, importsByFile, localDefinitionsByFile)

      if (callee === "app") {
        if (pathArg) {
          if (!pathMiddlewares[pathArg]) pathMiddlewares[pathArg] = []
          if (!pathMiddlewares[pathArg].includes(id)) pathMiddlewares[pathArg].push(id)
          if (/^[A-Za-z_$][\w$]*$/.test(id)) {
            routerMounts[id] = routerMounts[id] || { middlewares: [] }
            routerMounts[id].prefix = pathArg
          }
        } else {
          if (/^[A-Za-z_$][\w$]*$/.test(id) && !appMiddlewares.includes(id)) {
            appMiddlewares.push(id)
          }
        }
      } else {
        // router.use(...)
        routerMounts[callee] = routerMounts[callee] || { middlewares: [] }
        if (!routerMounts[callee].middlewares.includes(id)) {
          routerMounts[callee].middlewares.push(id)
        }
        if (pathArg) routerMounts[callee].prefix = routerMounts[callee].prefix || pathArg
      }
    }
  }
}

// ── Route dispatcher ──────────────────────────────────────────────────────

function detectRoutes(content: string, filePath: string, framework: string): DetectedRoute[] {
  const raw = matchFramework(content, framework, filePath)
  const seen = new Set<string>()
  return raw.filter((r) => {
    const key = `${r.method}|${r.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function matchFramework(content: string, framework: string, fp: string): DetectedRoute[] {
  switch (framework) {
    case "express": return detectExpress(content)
    case "nextjs":  return [] // handled separately
    case "fastapi": return detectFastAPI(content)
    case "flask":   return detectFlask(content)
    case "django":  return detectDjango(content)
    case "tornado": return detectTornado(content)
    case "sanic":   return detectSanic(content)
    case "starlette": return detectStarlette(content)
    case "litestar": return detectLitestar(content)
    case "aiohttp": return detectAiohttp(content)
    case "falcon":  return detectFalcon(content)
    case "nestjs":  return detectNestJS(content)
    case "laravel": return detectLaravel(content)
    case "fastify": return detectFastify(content)
    case "koa":     return detectKoa(content)
    case "hapi":    return detectHapi(content)
    case "kotlin":  return detectKtor(content)
    case "rails":   return detectRails(content)
    case "phoenix": return detectPhoenix(content)
    case "spring":  return detectSpring(content)
    case "micronaut": return detectMicronaut(content)
    case "quarkus": return detectQuarkus(content)
    case "aspnet":  return detectAspNet(content)
    case "go":      return detectGo(content)
    case "haskell": return detectServant(content)
    default:
      return [
        ...detectExpress(content),
        ...detectFastify(content),
        ...detectKoa(content),
        ...detectHapi(content),
        ...detectFastAPI(content),
        ...detectFlask(content),
        ...detectDjango(content),
        ...detectTornado(content),
        ...detectSanic(content),
        ...detectStarlette(content),
        ...detectLitestar(content),
        ...detectAiohttp(content),
        ...detectFalcon(content),
        ...detectNestJS(content),
        ...detectLaravel(content),
        ...detectRails(content),
        ...detectPhoenix(content),
        ...detectSpring(content),
        ...detectMicronaut(content),
        ...detectQuarkus(content),
        ...detectKtor(content),
        ...detectAspNet(content),
        ...detectGo(content),
        ...detectServant(content),
      ]
  }
}

// ── Express ───────────────────────────────────────────────────────────────

function detectExpress(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()

  // Collect express app and router variable names
  const appVars = new Set<string>(["app"])
  const routerVars = new Set<string>()
  for (const m of content.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\s*\(\s*\)/g)) {
    appVars.add(m[1])
  }
  for (const m of content.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:express\.Router\(\)|Router\(\))/g)) {
    routerVars.add(m[1])
  }

  const isAppObject = (obj: string) => obj === "app" || appVars.has(obj)
  const isRouterObject = (obj: string) => obj === "router" || routerVars.has(obj)

  // Full method capture: obj.method('path', ...args)
  // Handles multi-line args, template literals, chained calls
  const METHOD_RE =
    /([A-Za-z_$][\w$]*)\.(get|post|put|delete|patch|options|head|all)\s*\(\s*(['"`])((?:[^'"`\\]|\\.|(?!\3)[\s\S])*?)\3\s*,?([\s\S]*?)(?=\)\s*(?:;|\n|\/\/|app\.|router\.|[A-Za-z_$][\w$]*\.)|\n\n)/g

  for (const m of content.matchAll(METHOD_RE)) {
    try {
      const obj = m[1]
      const method = m[2].toUpperCase()
      const rawPath = m[4]
      const rawArgs = m[5] || ""

      if (!isAppObject(obj) && !isRouterObject(obj)) continue

      const resolvedPath = rawPath.replace(/\$\{[^}]+\}/g, ":param")
      const r = makeRoute(method, resolvedPath, "")
      r.controller = obj

      const ids: string[] = []
      for (const idm of rawArgs.matchAll(/\b([A-Za-z_$][\w$.]*)(?=\s*[,)])/g)) {
        const id = idm[1]
        if (["function", "async", "req", "res", "next", "request", "response"].includes(id)) continue
        if (/^['"`\d]/.test(id)) continue
        ids.push(id)
      }
      r.middlewareChain = ids

      detectAuthInArgs(rawArgs, r)
      detectBodyTypeInArgs(rawArgs, r)

      const key = `${method}|${r.path}`
      if (!seen.has(key)) {
        seen.add(key)
        routes.push(r)
      }
    } catch {}
  }

  // app.route('/path').get(...).post(...)
  const ROUTE_CHAIN_RE = /([A-Za-z_$][\w$]*)\.route\s*\(\s*(['"`])((?:[^'"`\\]|\\.|(?!\2)[\s\S])*?)\2\s*\)\s*((?:\s*\.\s*(?:get|post|put|delete|patch|options|head|all)\s*\(\s*[\s\S]*?\))+)/g
  for (const m of content.matchAll(ROUTE_CHAIN_RE)) {
    const obj = m[1]
    if (!isAppObject(obj) && !isRouterObject(obj)) continue

    const rawPath = m[3]
    const chain = m[4]
    const resolvedPath = rawPath.replace(/\$\{[^}]+\}/g, ":param")
    for (const mm of chain.matchAll(/\.\s*(get|post|put|delete|patch|options|head|all)\s*\(/g)) {
      const method = mm[1].toUpperCase()
      const path = normalizePath(resolvedPath)
      const key = `${method}|${path}`
      if (!seen.has(key)) {
        seen.add(key)
        routes.push(makeRoute(method, resolvedPath, ""))
      }
    }
  }

  // Fallback: simple single-line patterns missed by the above
  const SIMPLE_RE = /(?:app|router|[A-Za-z_$][\w$]*)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`\s][^'"`]*)['"`]/g
  for (const m of content.matchAll(SIMPLE_RE)) {
    const obj = m[0].split(".")[0]
    if (!isAppObject(obj) && !isRouterObject(obj)) continue
    const key = `${m[1].toUpperCase()}|${normalizePath(m[2])}`
    if (!seen.has(key)) {
      seen.add(key)
      routes.push(makeRoute(m[1].toUpperCase(), m[2], ""))
    }
  }

  return routes
}

// ── Fastify ─────────────────────────────────────────────────────────────────

function detectFastify(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const seen = new Set<string>()

  const INLINE_RE = /(?:fastify|server|app)\.(get|post|put|delete|patch|options|head|all)\s*\(\s*(['"`])((?:[^'"`\\]|\\.)*?)\2/g
  for (const m of sanitized.matchAll(INLINE_RE)) {
    const method = m[1].toUpperCase()
    const rawPath = m[3]
    const key = `${method}|${normalizePath(rawPath)}`
    if (!seen.has(key)) {
      seen.add(key)
      routes.push(makeRoute(method, rawPath, ""))
    }
  }

  const ROUTE_OBJ_RE = /(?:fastify|server|app)\.route\s*\(\s*\{([\s\S]*?)\}\s*\)/g
  for (const m of sanitized.matchAll(ROUTE_OBJ_RE)) {
    const block = m[1]
    const methodMatch = block.match(/method\s*:\s*['"]([^'"]+)['"]/i)
    const urlMatch = block.match(/(?:url|path)\s*:\s*['"]([^'"]+)['"]/i)
    if (methodMatch && urlMatch) {
      const method = methodMatch[1].toUpperCase()
      const rawPath = urlMatch[1]
      const key = `${method}|${normalizePath(rawPath)}`
      if (!seen.has(key)) {
        seen.add(key)
        routes.push(makeRoute(method, rawPath, ""))
      }
    }
  }

  return routes
}

// ── Koa ─────────────────────────────────────────────────────────────────────

function detectKoa(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const routerVars = new Set<string>()

  for (const m of sanitized.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Router\s*\(/g)) {
    routerVars.add(m[1])
  }

  const METHOD_RE = /([A-Za-z_$][\w$]*)\.(get|post|put|delete|patch|options|head)\s*\(\s*(['"`])((?:[^'"`\\]|\\.)*?)\3/g
  const seen = new Set<string>()
  for (const m of sanitized.matchAll(METHOD_RE)) {
    const obj = m[1]
    const method = m[2].toUpperCase()
    const rawPath = m[4]
    if (obj !== "router" && !routerVars.has(obj)) continue
    const key = `${method}|${normalizePath(rawPath)}`
    if (!seen.has(key)) {
      seen.add(key)
      routes.push(makeRoute(method, rawPath, ""))
    }
  }

  return routes
}

function detectKtor(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const seen = new Set<string>()

  const DIRECT_RE = /\b(get|post|put|delete|patch|options|head)\s*\(\s*(['"])([^'"\s][^'"\)]*)\2/g
  for (const m of sanitized.matchAll(DIRECT_RE)) {
    const method = m[1].toUpperCase()
    const rawPath = m[3]
    const key = `${method}|${normalizePath(rawPath)}`
    if (!seen.has(key)) {
      seen.add(key)
      routes.push(makeRoute(method, rawPath, ""))
    }
  }

  const PREFIX_RE = /route\s*\(\s*(['"])([^'"\s][^'"\)]*)\1\s*\)\s*\{([\s\S]*?)\}/g
  for (const m of sanitized.matchAll(PREFIX_RE)) {
    const prefix = m[2]
    const block = m[3]
    for (const inner of block.matchAll(DIRECT_RE)) {
      const method = inner[1].toUpperCase()
      const rawPath = normalizePath(`${prefix}/${inner[3]}`)
      const key = `${method}|${rawPath}`
      if (!seen.has(key)) {
        seen.add(key)
        routes.push(makeRoute(method, rawPath, ""))
      }
    }
  }

  return routes
}

// ── Hapi ───────────────────────────────────────────────────────────────────

function detectHapi(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const seen = new Set<string>()

  const ROUTE_OBJ_RE = /server\.route\s*\(\s*\{([\s\S]*?)\}\s*\)/g
  for (const m of sanitized.matchAll(ROUTE_OBJ_RE)) {
    const block = m[1]
    const methodMatch = block.match(/method\s*:\s*['"]([^'"]+)['"]/i)
    const pathMatch = block.match(/path\s*:\s*['"]([^'"]+)['"]/i)
    if (methodMatch && pathMatch) {
      const method = methodMatch[1].toUpperCase()
      const rawPath = pathMatch[1]
      const key = `${method}|${normalizePath(rawPath)}`
      if (!seen.has(key)) {
        seen.add(key)
        routes.push(makeRoute(method, rawPath, ""))
      }
    }
  }

  const ROUTE_ARRAY_RE = /server\.route\s*\(\s*\[([\s\S]*?)\]\s*\)/g
  for (const m of sanitized.matchAll(ROUTE_ARRAY_RE)) {
    const arrayBlock = m[1]
    const ITEMS_RE = /\{([\s\S]*?)\}/g
    for (const item of arrayBlock.matchAll(ITEMS_RE)) {
      const block = item[1]
      const methodMatch = block.match(/method\s*:\s*['"]([^'"]+)['"]/i)
      const pathMatch = block.match(/path\s*:\s*['"]([^'"]+)['"]/i)
      if (methodMatch && pathMatch) {
        const method = methodMatch[1].toUpperCase()
        const rawPath = pathMatch[1]
        const key = `${method}|${normalizePath(rawPath)}`
        if (!seen.has(key)) {
          seen.add(key)
          routes.push(makeRoute(method, rawPath, ""))
        }
      }
    }
  }

  return routes
}

/**
 * Python route detection limitations:
 * - Static regex only: dynamic `@app.route` paths built at runtime, `add_url_rule` with variables, and metaclass-generated routes are missed.
 * - Decorators applied via wrappers/imports (e.g. custom blueprints) may not match.
 * - Django URL includes (`include()`) are not recursively resolved across files.
 * - FastAPI `APIRouter` prefixes inferred only from literal `prefix=` / `include_router` patterns in the same file.
 */
// ── FastAPI ─────────────────────────────────────────────────────────────────────

export function detectFastAPI(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)

  const routerPrefixMap = new Map<string, string>()
  const APIRouter_PREFIX_RE = /([A-Za-z_][\w]*)\s*=\s*APIRouter\s*\(\s*[^\)]*prefix\s*[:=]\s*['\"]([^'\"]+)['\"][^\)]*\)/g
  for (const m of sanitized.matchAll(APIRouter_PREFIX_RE)) {
    routerPrefixMap.set(m[1], m[2])
  }

  const INCLUDE_ROUTER_RE = /(?:[A-Za-z_][\w]*)\.include_router\s*\(\s*([A-Za-z_][\w]*)\s*,\s*prefix\s*=\s*['\"]([^'\"]+)['\"]/g
  for (const m of sanitized.matchAll(INCLUDE_ROUTER_RE)) {
    const routerName = m[1]
    const includePrefix = m[2]
    const existing = routerPrefixMap.get(routerName)
    routerPrefixMap.set(routerName, existing ? normalizePath(`${includePrefix}/${existing}`) : includePrefix)
  }

  const FASTAPI_RE = /@([A-Za-z_][\w]*)\.(get|post|put|delete|patch)\s*\(\s*(['\"])([^'"\s][^'\"]*)\3([\s\S]*?)(?=\n\s*@|\n\s*def\s|$)/g
  for (const m of sanitized.matchAll(FASTAPI_RE)) {
    const target = m[1]
    const method = m[2].toUpperCase()
    const routePath = m[4]
    const decoratorArgs = m[5] || ""
    const r = makeRoute(method, routePath, "")
    r.controller = target

    const hasDependsAuth = /Depends\s*\(\s*(?:get_current_user|oauth2_scheme|verify_token|auth|jwt|token)/i.test(decoratorArgs)
      || /dependencies\s*=\s*\[.*?Depends\s*\(\s*(?:get_current_user|oauth2_scheme|verify_token|auth|jwt|token)/i.test(decoratorArgs)
    if (hasDependsAuth) {
      r.authRequired = true
      r.authType = "jwt"
      r.reasonings?.push("FastAPI Depends() d'auth détecté")
    }

    if (/response_model\s*=/.test(decoratorArgs)) {
      r.reasonings?.push("response_model spécifié")
    }
    if (/status_code\s*=/.test(decoratorArgs)) {
      r.reasonings?.push("status_code spécifié")
    }

    const after = sanitized.slice((m.index ?? 0) + m[0].length)
    const fnMatch = after.match(/\n\s*(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(([^)]*)\)/m)
    const params = fnMatch?.[1] ?? ""

    if (params) {
      if (/\bUploadFile\b/.test(params)) {
        r.bodyType = "form"
        r.reasonings?.push("UploadFile détecté dans la signature FastAPI")
      } else if (/\bForm\s*\(/.test(params)) {
        r.bodyType = "form"
        r.reasonings?.push("Form(...) détecté dans la signature FastAPI")
      } else if (!/\bQuery\s*\(|\bPath\s*\(|\bDepends\s*\(/.test(params) && /:\s*[A-Za-z_][\w.<>\[\]]*/.test(params)) {
        r.bodyType = "json"
        r.reasonings?.push("Body JSON détecté par annotation de paramètre FastAPI")
      }

      if (/Depends\s*\(\s*(?:get_current_user|oauth2_scheme|verify_token|auth|jwt|token)/i.test(params)) {
        r.authRequired = true
        r.authType = "jwt"
        r.reasonings?.push("FastAPI Depends() d'auth détecté dans la signature")
      }
    }

    const routerPrefix = routerPrefixMap.get(target)
    if (routerPrefix) {
      r.path = normalizePath(`${routerPrefix}/${r.path}`)
    }

    detectAuthByStatusSignal(content, r)
    routes.push(r)
  }

  // Also catch without trailing function (simple pattern fallback)
  const SIMPLE_RE = /@(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"\s][^'")]*)['"]/g
  const seenKeys = new Set(routes.map((r) => `${r.method}|${r.path}`))
  for (const m of content.matchAll(SIMPLE_RE)) {
    const key = `${m[1].toUpperCase()}|${normalizePath(m[2])}`
    if (!seenKeys.has(key)) {
      seenKeys.add(key)
      const r = makeRoute(m[1].toUpperCase(), m[2], "")
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  return routes
}

// ── Flask ─────────────────────────────────────────────────────────────────

export function detectFlask(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const blueprintPrefix = new Map<string, string>()
  const methodViewMethods = new Map<string, string[]>()

  const REGISTER_BP_RE = /app\.register_blueprint\s*\(\s*([A-Za-z_][\w]*)\s*,\s*url_prefix\s*=\s*['\"]([^'\"]+)['\"]\s*\)/g
  for (const m of sanitized.matchAll(REGISTER_BP_RE)) {
    blueprintPrefix.set(m[1], m[2])
  }

  const BLUEPRINT_DEF_RE = /([A-Za-z_][\w]*)\s*=\s*Blueprint\s*\(\s*['\"][^'\"\s]+['\"]\s*,[\s\S]*?url_prefix\s*=\s*['\"]([^'\"]+)['\"]/g
  for (const m of sanitized.matchAll(BLUEPRINT_DEF_RE)) {
    blueprintPrefix.set(m[1], m[2])
  }

  const METHOD_VIEW_CLASS_RE = /class\s+([A-Za-z_][\w]*)\s*\(\s*MethodView\s*\)[\s\S]*?(?=\nclass\s|\n\n|$)/g
  for (const m of sanitized.matchAll(METHOD_VIEW_CLASS_RE)) {
    const className = m[1]
    const body = m[0]
    const methods = Array.from(body.matchAll(/def\s+(get|post|put|delete|patch)\s*\(/g)).map((x) => x[1].toUpperCase())
    if (methods.length) methodViewMethods.set(className, methods)
  }

  // @app.route, @blueprint.route, @bp.get/post, or app.add_url_rule
  const ROUTE_RE = /@([A-Za-z_][\w.]*)\.(route|get|post|put|delete|patch|options|head|add_url_rule)\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]{0,300}?)(?=\n(?:def|class|\s*$))/g
  // NOTE: parse decorators from raw content so quoted paths are preserved.
  for (const m of content.matchAll(ROUTE_RE)) {
    const decoratorTarget = m[1]
    const methodName = m[2]
    let routePath = m[3]
    const args = m[4] || ""
    const methods = methodName === "route" || methodName === "add_url_rule"
      ? (() => { const result = parseMethodList(args); return result.length ? result : ["GET"] })()
      : [methodName.toUpperCase()]

    const viewClassName = args.match(/([A-Za-z_][\w]*)\.as_view\(/)?.[1]
    if (methodName === "add_url_rule" && viewClassName && methodViewMethods.has(viewClassName)) {
      const viewMethods = methodViewMethods.get(viewClassName)
      if (viewMethods?.length) {
        methods.length = 0
        methods.push(...viewMethods)
      }
    }

    const prefix = blueprintPrefix.get(decoratorTarget.split(".")[0])
    if (prefix) {
      routePath = normalizePath(`${prefix}${routePath.startsWith("/") ? "" : "/"}${routePath}`)
    }

    const head = content.slice(Math.max(0, (m.index ?? 0) - 200), (m.index ?? 0))
    const hasAuth = /@login_required|@jwt_required|@token_required|@requires_auth|@permission_required|@fresh_jwt_required/.test(head)

    for (const method of methods) {
      const r = makeRoute(method, routePath, "")
      if (hasAuth || /@login_required|@jwt_required|@token_required|@requires_auth/.test(m[0])) {
        r.authRequired = true
        r.authType = "middleware"
        r.reasonings?.push("Décorateur d'auth Flask détecté (@login_required, @jwt_required, etc.)")
      }
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  const ADD_URL_RULE_RE = /([A-Za-z_][\w.]*)\.add_url_rule\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of content.matchAll(ADD_URL_RULE_RE)) {
    const decoratorTarget = m[1]
    let routePath = m[2]
    const args = m[3] || ""
    const methods = (() => { const result = parseMethodList(args); return result.length ? result : ["GET"] })()
    const viewClassName = args.match(/([A-Za-z_][\w]*)\.as_view\(/)?.[1]
    if (viewClassName && methodViewMethods.has(viewClassName)) {
      const viewMethods = methodViewMethods.get(viewClassName)
      if (viewMethods?.length) {
        methods.length = 0
        methods.push(...viewMethods)
      }
    }

    const prefix = blueprintPrefix.get(decoratorTarget.split(".")[0])
    if (prefix) {
      routePath = normalizePath(`${prefix}${routePath.startsWith("/") ? "" : "/"}${routePath}`)
    }

    for (const method of methods) {
      const r = makeRoute(method, routePath, "")
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  const ADD_RESOURCE_RE = /([A-Za-z_][\w.]*)\.add_resource\s*\(\s*([A-Za-z_][\w.]*)\s*,\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of content.matchAll(ADD_RESOURCE_RE)) {
    const resourceClass = m[2]
    let routePath = m[3]
    const methods = methodViewMethods.get(resourceClass) ?? ["GET", "POST", "PUT", "DELETE", "PATCH"]
    for (const method of methods) {
      const r = makeRoute(method, routePath, "")
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  // Fallback simple
  if (routes.length === 0) {
    const SIMPLE = /@app\.route\s*\(\s*['"]([^'"\s][^'")]*)['"]/g
    for (const m of content.matchAll(SIMPLE)) {
      routes.push(makeRoute("GET", m[1], ""))
    }
  }

  return routes
}

// ── Django ────────────────────────────────────────────────────────────────

export function detectDjango(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  // path('endpoint/', view_func, name='...')
  const PATH_RE = /(?:re_)?path\s*\(\s*['"]([^'"\s][^'"]*)['"],\s*([A-Za-z_][\w.]*)/g
  for (const m of content.matchAll(PATH_RE)) {
    const r = makeRoute("GET", m[1].replace(/\(\?P<[^>]+>[^)]+\)/g, ":param"), "")
    r.controller = m[2]
    // If view has 'login_required' or 'permission_required' wrapper
    const viewDef = content.match(new RegExp(`${escapeRegExpStr(m[2])}[\\s\\S]{0,200}?@(?:login_required|permission_required)`))
    if (viewDef) {
      r.authRequired = true
      r.authType = "middleware"
      r.reasonings?.push("Django @login_required / @permission_required détecté")
    }
    routes.push(r)
  }

  // router.register for DRF viewsets
  const ROUTER_RE = /router\.register\s*\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z_][\w]*)/g
  for (const m of content.matchAll(ROUTER_RE)) {
    for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
      routes.push(makeRoute(method, `/${m[1]}`, ""))
    }
  }

  return routes
}

function detectTornado(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const handlerMethods = new Map<string, string[]>()
  const HANDLER_RE = /class\s+([A-Za-z_][\w]*)\s*\([^\n]*RequestHandler[^\)]*\):([\s\S]*?)(?=\nclass\s|\n\n|$)/g
  for (const m of sanitized.matchAll(HANDLER_RE)) {
    const className = m[1]
    const body = m[2]
    const methods = Array.from(body.matchAll(/def\s+(get|post|put|delete|patch)\s*\(/g)).map((x) => x[1].toUpperCase())
    if (methods.length) handlerMethods.set(className, methods)
  }

  const ROUTE_LIST_RE = /Application\s*\(\s*\[([\s\S]*?)\]/g
  for (const m of sanitized.matchAll(ROUTE_LIST_RE)) {
    const listBody = m[1]
    for (const entry of listBody.matchAll(/\(\s*['"]([^'"\s][^'\"]*)['"]\s*,\s*([A-Za-z_][\w.]*)/g)) {
      const pathValue = entry[1]
      const handler = entry[2].split(".").pop() || entry[2]
      const methods = handlerMethods.get(handler) ?? ["GET"]
      for (const method of methods) {
        const r = makeRoute(method, normalizePath(pathValue), "")
        detectAuthByStatusSignal(content, r)
        routes.push(r)
      }
    }
  }

  return routes
}

function detectSanic(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const blueprintPrefix = new Map<string, string>()

  const BLUEPRINT_DEF_RE = /([A-Za-z_][\w]*)\s*=\s*Blueprint\s*\(\s*['"][^'"\s]+['"]\s*,[\s\S]*?url_prefix\s*=\s*['"]([^'\"]+)['"]/g
  for (const m of sanitized.matchAll(BLUEPRINT_DEF_RE)) {
    blueprintPrefix.set(m[1], m[2])
  }

  const ROUTE_RE = /@([A-Za-z_][\w.]*)\.(get|post|put|delete|patch|options|head|route)\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(ROUTE_RE)) {
    const target = m[1]
    const methodName = m[2]
    let routePath = m[3]
    const args = m[4] || ""
    const methods = methodName === "route"
      ? (() => { const result = parseMethodList(args); return result.length ? result : ["GET"] })()
      : [methodName.toUpperCase()]

    const prefix = blueprintPrefix.get(target.split(".")[0])
    if (prefix) {
      routePath = normalizePath(`${prefix}${routePath.startsWith("/") ? "" : "/"}${routePath}`)
    }

    for (const method of methods) {
      const r = makeRoute(method, normalizePath(routePath), "")
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  const ADD_ROUTE_RE = /([A-Za-z_][\w.]*)\.add_route\s*\(\s*([A-Za-z_][\w.]*)\s*,\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(ADD_ROUTE_RE)) {
    const target = m[1]
    let routePath = m[3]
    const args = m[4] || ""
    const methods = (() => { const result = parseMethodList(args); return result.length ? result : ["GET"] })()
    const prefix = blueprintPrefix.get(target.split(".")[0])
    if (prefix) {
      routePath = normalizePath(`${prefix}${routePath.startsWith("/") ? "" : "/"}${routePath}`)
    }
    for (const method of methods) {
      const r = makeRoute(method, normalizePath(routePath), "")
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  return routes
}

function detectStarlette(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)

  const ROUTE_RE = /Route\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(ROUTE_RE)) {
    const routePath = m[1]
    const args = m[2] || ""
    const methods = (() => { const result = parseMethodList(args); return result.length ? result : ["GET"] })()
    for (const method of methods) {
      const r = makeRoute(method, normalizePath(routePath), "")
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  return routes
}

function detectLitestar(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)

  const ROUTE_RE = /@(?:get|post|put|delete|patch|options|head|route)\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(ROUTE_RE)) {
    const routePath = m[1]
    const argText = m[2] || ""
    const methods = (() => { const result = parseMethodList(argText); return result.length ? result : ["GET"] })()
    for (const method of methods) {
      const r = makeRoute(method, normalizePath(routePath), "")
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  return routes
}

function detectAiohttp(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)

  const DECORATOR_RE = /@([A-Za-z_][\w.]*)\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(DECORATOR_RE)) {
    const method = m[2].toUpperCase()
    const routePath = m[3]
    const r = makeRoute(method, normalizePath(routePath), "")
    detectAuthByStatusSignal(content, r)
    routes.push(r)
  }

  const ADD_ROUTE_RE = /([A-Za-z_][\w.]*)\.router\.add_(get|post|put|delete|patch|route)\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(ADD_ROUTE_RE)) {
    let method = m[2].toUpperCase()
    let routePath = m[3]
    const args = m[4] || ""
    if (method === "ROUTE") {
      const explicit = args.match(/['\"](GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)['\"]/i)?.[1]
      if (explicit) method = explicit.toUpperCase()
    }
    const r = makeRoute(method, normalizePath(routePath), "")
    detectAuthByStatusSignal(content, r)
    routes.push(r)
  }

  return routes
}

function detectFalcon(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const resourceMethods = new Map<string, string[]>()

  const RESOURCE_RE = /class\s+([A-Za-z_][\w]*)\s*\([^\n]*\):([\s\S]*?)(?=\nclass\s|\n\n|$)/g
  for (const m of sanitized.matchAll(RESOURCE_RE)) {
    const className = m[1]
    const body = m[2]
    const methods = Array.from(body.matchAll(/def\s+on_(get|post|put|delete|patch)\s*\(/g)).map((x) => x[1].toUpperCase())
    if (methods.length) resourceMethods.set(className, methods)
  }

  const ADD_ROUTE_RE = /([A-Za-z_][\w.]*)\.add_route\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]\s*,\s*([A-Za-z_][\w.]*)/g
  for (const m of sanitized.matchAll(ADD_ROUTE_RE)) {
    const routePath = m[2]
    const resourceName = m[3].split(".").pop() || m[3]
    const methods = resourceMethods.get(resourceName) ?? ["GET"]
    for (const method of methods) {
      const r = makeRoute(method, normalizePath(routePath), "")
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  return routes
}

// ── NestJS ────────────────────────────────────────────────────────────────────────

function detectNestJS(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  // @Get(), @Post('sub'), @Put(':id'), etc.
  const METHOD_RE = /@(Get|Post|Put|Delete|Patch|Options|Head|All)\s*\(\s*(?:['"`]([^'"`]*)['"` `]\s*)?\)/g
  for (const m of content.matchAll(METHOD_RE)) {
    const method = m[1].toUpperCase() === "ALL" ? "GET" : m[1].toUpperCase()
    const subPath = m[2] ?? ""
    const r = makeRoute(method, subPath || "/", "")

    // Detect guards: @UseGuards(JwtAuthGuard), @UseGuards(AuthGuard('jwt'))
    // Look in the 200 chars before this decorator
    const idx = m.index ?? 0
    const preceding = content.slice(Math.max(0, idx - 300), idx)
    if (/@UseGuards\s*\(/.test(preceding) || /@Roles\s*\(/.test(preceding)) {
      r.authRequired = true
      r.authType = "middleware"
      r.reasonings?.push("NestJS @UseGuards / @Roles détecté avant la route")
    }

    routes.push(r)
  }
  return routes
}

// ── Laravel ───────────────────────────────────────────────────────────────

function detectLaravel(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  // Route::get('/path', ...)
  const ROUTE_RE = /Route::(get|post|put|delete|patch|any|match)\s*\(\s*['"]([^'"\s][^'")]*)['"]([\s\S]{0,300}?)(?=;)/g
  for (const m of content.matchAll(ROUTE_RE)) {
    const method = m[1] === "any" ? "GET" : m[1].toUpperCase()
    const r = makeRoute(method, m[2], "")
    const args = m[3] || ""

    // ->middleware('auth') or ->middleware(['auth:api'])
    if (/->middleware\s*\(\s*['"]auth/.test(args) || /->middleware\s*\(\s*\[.*?auth/.test(args)) {
      r.authRequired = true
      r.authType = "middleware"
      r.reasonings?.push("Laravel ->middleware('auth') détecté")
    }
    routes.push(r)
  }

  // Route::middleware(['auth'])->group(function() { Route::get(...) })
  const GROUP_MIDDLEWARE_RE = /Route::middleware\s*\(\s*\[?['"]([^'"]+)['"]\]?\s*\)[\s\S]{0,50}->group\s*\([\s\S]{0,2000}?(?=Route::middleware|$)/g
  for (const m of content.matchAll(GROUP_MIDDLEWARE_RE)) {
    const isAuth = /auth/.test(m[1])
    const groupContent = m[0]
    const INNER = /Route::(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g
    for (const inner of groupContent.matchAll(INNER)) {
      const r = makeRoute(inner[1].toUpperCase(), inner[2], "")
      if (isAuth) {
        r.authRequired = true
        r.authType = "middleware"
        r.reasonings?.push("Héritage middleware auth depuis Route::middleware()->group()")
      }
      routes.push(r)
    }
  }

  return routes
}

// ── Rails ─────────────────────────────────────────────────────────────────

function detectRails(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  // get '/path', to: 'controller#action'
  const VERB_RE = /\b(get|post|put|patch|delete|resources?|namespace)\s+['"]([^'"]+)['"]([\s\S]{0,200}?)(?=\n\s*(?:get|post|put|patch|delete|resources?|end|namespace)|$)/g
  for (const m of content.matchAll(VERB_RE)) {
    const verb = m[1]
    const routePath = m[2]
    const opts = m[3] || ""

    if (verb === "resources" || verb === "resource") {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        routes.push(makeRoute(method, `/${routePath}`, ""))
      }
    } else if (verb === "namespace") {
      // just record the namespace - inner routes handled separately
      routes.push(makeRoute("GET", `/${routePath}`, ""))
    } else {
      const r = makeRoute(verb.toUpperCase(), routePath, "")
      if (/authenticate_user!|before_action\s*:authenticate/.test(opts)) {
        r.authRequired = true
        r.authType = "middleware"
        r.reasonings?.push("Rails authenticate_user! / before_action :authenticate détecté")
      }
      routes.push(r)
    }
  }
  return routes
}

// ── Phoenix (Elixir) ─────────────────────────────────────────────────────

function detectPhoenix(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  // get "/path", PageController, :index
  const VERB_RE = /\b(get|post|put|patch|delete)\s*\(\s*['"]([^'"\s][^'"]*)['"]\s*,\s*([A-Za-z0-9_.]+)\s*,\s*:?([A-Za-z0-9_]+)?/gi
  for (const m of content.matchAll(VERB_RE)) {
    const method = m[1].toUpperCase()
    const pathStr = m[2]
    const controller = m[3]
    const action = m[4] || "index"
    const r = makeRoute(method, pathStr, `${controller}#${action}`)
    r.controller = controller
    // detect pipeline :browser/:api as auth hint
    const ctx = content.slice(Math.max(0, (m.index ?? 0) - 200), (m.index ?? 0) + 200)
    if (/pipeline\s*:\s*browser|pipeline\s*:\s*api|pipe_through\s*:\s*\[:?\w+/.test(ctx)) {
      // not a definitive auth signal but mark as middleware if pipe_through suggests auth
      if (/auth|authenticate|ensure_auth|:browser/.test(ctx)) {
        r.authRequired = true
        r.authType = "middleware"
        r.reasonings?.push("Pipeline/pipe_through suggerant protection détecté")
      }
    }
    routes.push(r)
  }

  // resources "/posts", PostController
  const RES_RE = /\bresources\s*\(\s*['"]([^'"\s][^'"]*)['"]\s*,\s*([A-Za-z0-9_.]+)/gi
  for (const m of content.matchAll(RES_RE)) {
    const base = m[1]
    const controller = m[2]
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const r = makeRoute(method, `/${base}`, `${controller}#resource`)
      r.controller = controller
      routes.push(r)
    }
  }

  return routes
}

// ── Servant (Haskell) ────────────────────────────────────────────────────

function detectServant(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  // Match type-level string segments like "users" :> Get
  const PATH_RE = /"([^"\\]+)"\s*:\s*>/g
  const seen = new Set<string>()
  for (const m of content.matchAll(PATH_RE)) {
    const seg = m[1]
    // create a simple GET route for type-level path segments
    const path = `/${seg}`
    if (!seen.has(path)) {
      seen.add(path)
      routes.push(makeRoute("GET", path, "Servant inferred route"))
    }
  }

  // Also fallback: look for Warp or Wai handlers with literal paths
  const LIT_RE = /\"([\/][^\"]+)\"/g
  for (const m of content.matchAll(LIT_RE)) {
    const p = m[1]
    if (p.includes("/") && !seen.has(p)) {
      seen.add(p)
      routes.push(makeRoute("GET", p, "Servant/WAI inferred route"))
    }
  }

  return routes
}

// ── Spring (Java/Kotlin) ──────────────────────────────────────────────────

function parseJavaSource(source: string): any | null {
  if (!source || !source.trim()) return null
  try {
    if (typeof require !== "function") return null
    const parser = require("java-parser")
    return parser?.parse ? parser.parse(source) : null
  } catch {
    return null
  }
}

function findJavaNodes(node: any, name: string): any[] {
  if (!node || typeof node !== "object") return []
  const results: any[] = []
  if (node.name === name) results.push(node)
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        results.push(...findJavaNodes(child, name))
      }
    } else if (value && typeof value === "object") {
      results.push(...findJavaNodes(value, name))
    }
  }
  return results
}

function collectJavaIdentifiers(node: any): string[] {
  if (!node || typeof node !== "object") return []
  if (node.name === "Identifier" && typeof node.image === "string") return [node.image]
  let identifiers: string[] = []
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        identifiers = identifiers.concat(collectJavaIdentifiers(child))
      }
    } else if (value && typeof value === "object") {
      identifiers = identifiers.concat(collectJavaIdentifiers(value))
    }
  }
  return identifiers
}

function findFirstStringLiteral(node: any): string | undefined {
  if (!node || typeof node !== "object") return undefined
  if (node.name === "StringLiteral" && typeof node.image === "string") {
    return node.image.replace(/^"|"$/g, "")
  }
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = findFirstStringLiteral(child)
        if (found) return found
      }
    } else if (value && typeof value === "object") {
      const found = findFirstStringLiteral(value)
      if (found) return found
    }
  }
  return undefined
}

function findLastIdentifier(node: any): string | undefined {
  const ids = collectJavaIdentifiers(node)
  return ids.length ? ids[ids.length - 1] : undefined
}

function getJavaAnnotationName(annotation: any): string {
  const typeName = annotation?.children?.typeName?.[0]
  return collectJavaIdentifiers(typeName).join(".")
}

function getJavaAnnotationPairs(annotation: any): Record<string, string> {
  const result: Record<string, string> = {}
  const pairs = annotation?.children?.elementValuePairList?.[0]?.children?.elementValuePair
  if (!Array.isArray(pairs)) return result
  for (const pair of pairs) {
    const key = pair?.children?.Identifier?.[0]?.image
    const valueNode = pair?.children?.elementValue?.[0]
    if (!key || !valueNode) continue
    result[key] = findFirstStringLiteral(valueNode) ?? findLastIdentifier(valueNode) ?? ""
  }
  return result
}

function getJavaAnnotationValue(annotation: any): string | undefined {
  const directValue = findFirstStringLiteral(annotation?.children?.elementValue?.[0])
  if (directValue) return directValue
  const pairs = getJavaAnnotationPairs(annotation)
  return pairs.value || pairs.path || pairs.name
}

function getJavaAnnotationMethod(annotation: any): string | undefined {
  const rawName = getJavaAnnotationName(annotation)
  const name = rawName.split(".").pop()?.toUpperCase() ?? ""
  if (["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "ALL"].includes(name)) {
    return name
  }
  if (name === "REQUESTMAPPING") {
    const pairs = getJavaAnnotationPairs(annotation)
    const method = pairs.method
    if (typeof method === "string" && method.length > 0) {
      return method.split(".").pop()?.toUpperCase() ?? "GET"
    }
    return "GET"
  }
  if (name.endsWith("MAPPING")) {
    return name.replace(/MAPPING$/, "") || "GET"
  }
  return undefined
}

function getJavaAnnotationPath(annotation: any): string | undefined {
  const value = getJavaAnnotationValue(annotation)
  return value ? normalizePath(value) : undefined
}

function matchJavaClassPrefix(classNode: any, validNames: string[]): string {
  const annotations = findJavaNodes(classNode, "annotation")
  for (const annotation of annotations) {
    const annotationName = getJavaAnnotationName(annotation).split(".").pop() ?? ""
    if (validNames.includes(annotationName)) {
      return getJavaAnnotationPath(annotation) ?? ""
    }
  }
  return ""
}

function detectSpringAST(content: string): DetectedRoute[] {
  const ast = parseJavaSource(content)
  if (!ast) return []
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  const classDeclarations = findJavaNodes(ast, "classDeclaration")
  for (const classNode of classDeclarations) {
    const classPrefix = matchJavaClassPrefix(classNode, ["RequestMapping", "GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping"])
    const methodDeclarations = findJavaNodes(classNode, "methodDeclaration")
    for (const methodDecl of methodDeclarations) {
      const annotations = findJavaNodes(methodDecl, "annotation")
      for (const annotation of annotations) {
        const annotationName = getJavaAnnotationName(annotation).split(".").pop() ?? ""
        const method = getJavaAnnotationMethod(annotation)
        if (!method) continue
        const subPath = getJavaAnnotationPath(annotation) ?? ""
        const path = normalizePath(`${classPrefix}/${subPath}`)
        const key = `${method}|${path}`
        if (seen.has(key)) continue
        seen.add(key)
        routes.push(makeRoute(method, path, ""))
      }
    }
  }
  return routes
}

function detectMicronautAST(content: string): DetectedRoute[] {
  const ast = parseJavaSource(content)
  if (!ast) return []
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  const classDeclarations = findJavaNodes(ast, "classDeclaration")
  for (const classNode of classDeclarations) {
    const classPrefix = matchJavaClassPrefix(classNode, ["Controller"])
    const methodDeclarations = findJavaNodes(classNode, "methodDeclaration")
    for (const methodDecl of methodDeclarations) {
      const annotations = findJavaNodes(methodDecl, "annotation")
      for (const annotation of annotations) {
        const annotationName = getJavaAnnotationName(annotation).split(".").pop() ?? ""
        const method = getJavaAnnotationMethod(annotation)
        if (!method) continue
        const subPath = getJavaAnnotationPath(annotation) ?? ""
        const path = normalizePath(`${classPrefix}/${subPath}`)
        const key = `${method}|${path}`
        if (seen.has(key)) continue
        seen.add(key)
        routes.push(makeRoute(method, path, ""))
      }
    }
  }
  return routes
}

function detectQuarkusAST(content: string): DetectedRoute[] {
  const ast = parseJavaSource(content)
  if (!ast) return []
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  const classDeclarations = findJavaNodes(ast, "classDeclaration")
  for (const classNode of classDeclarations) {
    const classPrefix = matchJavaClassPrefix(classNode, ["Path"])
    const methodDeclarations = findJavaNodes(classNode, "methodDeclaration")
    for (const methodDecl of methodDeclarations) {
      const annotations = findJavaNodes(methodDecl, "annotation")
      const pathAnnotation = annotations.find((anno) => (getJavaAnnotationName(anno).split(".").pop() ?? "") === "Path")
      const verbAnnotation = annotations.find((anno) => {
        const name = (getJavaAnnotationName(anno).split(".").pop() ?? "").toUpperCase()
        return ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].includes(name)
      })
      if (!verbAnnotation) continue
      const method = getJavaAnnotationMethod(verbAnnotation)
      if (!method) continue
      const subPath = pathAnnotation ? getJavaAnnotationPath(pathAnnotation) ?? "" : ""
      const path = normalizePath(`${classPrefix}/${subPath}`)
      const key = `${method}|${path}`
      if (seen.has(key)) continue
      seen.add(key)
      routes.push(makeRoute(method, path, ""))
    }
  }
  return routes
}

function extractJavaAnnotationPath(source: string): string {
  return source.match(/(?:value|path)\s*=\s*['"]([^'"]+)['"]/)?.[1]
    ?? source.match(/\(\s*['"]([^'"]+)['"]\s*\)/)?.[1]
    ?? ""
}

function extractJavaRequestMethod(source: string): string | undefined {
  return source.match(/RequestMethod\.([A-Za-z]+)/)?.[1]
}

function detectMicronaut(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const astRoutes = detectMicronautAST(content)
  if (astRoutes.length > 0) return astRoutes

  const classPrefix = content.match(/@Controller\s*\(\s*(?:value\s*=\s*)?['"]([^'"]+)['"]\s*\)/)?.[1] ?? ""
  const METHOD_RE = /@(Get|Post|Put|Delete|Patch)\s*\(\s*(?:value\s*=\s*)?['"]([^'"]*)['"]\s*\)/g

  for (const m of content.matchAll(METHOD_RE)) {
    const verb = m[1].toUpperCase()
    const subPath = m[2] || ""
    routes.push(makeRoute(verb, normalizePath(`${classPrefix}/${subPath}`), ""))
  }

  return routes
}

function detectQuarkus(content: string): DetectedRoute[] {
  const astRoutes = detectQuarkusAST(content)
  if (astRoutes.length > 0) return astRoutes

  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  const classPrefix = content.match(/@Path\s*\(\s*['"]([^'"]+)['"]\s*\)/)?.[1] ?? ""
  const METHOD_BLOCK_RE = /((?:@\w+(?:\s*\([^)]*\))?\s*)+)(?=\s*(?:public|private|protected|fun)\s)/g

  for (const blockMatch of content.matchAll(METHOD_BLOCK_RE)) {
    const block = blockMatch[1]
    const verbMatch = block.match(/@(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/)
    if (!verbMatch) continue

    const method = verbMatch[1] === "OPTIONS" ? "GET" : verbMatch[1]
    const subPath = extractJavaAnnotationPath(block)
    const path = normalizePath(`${classPrefix}/${subPath}`)
    const key = `${method}|${path}`
    if (!seen.has(key)) {
      seen.add(key)
      routes.push(makeRoute(method, path, ""))
    }
  }

  return routes
}

function detectSpring(content: string): DetectedRoute[] {
  const astRoutes = detectSpringAST(content)
  if (astRoutes.length > 0) return astRoutes

  const routes: DetectedRoute[] = []
  const classPrefix = extractJavaAnnotationPath(content.match(/@RequestMapping\s*\(([^)]*)\)/)?.[1] ?? "")

  // @GetMapping, @PostMapping, etc.
  const MAP_RE = /@(Get|Post|Put|Delete|Patch|Request)Mapping\s*\(([^)]*)\)/g
  const seen = new Set<string>()
  for (const m of content.matchAll(MAP_RE)) {
    const verb = m[1] === "Request" ? (extractJavaRequestMethod(m[2]) || "GET") : m[1].toUpperCase()
    const subPath = extractJavaAnnotationPath(m[2])
    const path = normalizePath(`${classPrefix}/${subPath}`)
    const r = makeRoute(verb, path, "")

    const idx = m.index ?? 0
    const preceding = content.slice(Math.max(0, idx - 400), idx)
    if (/@PreAuthorize|@Secured|@RolesAllowed|@WithMockUser/.test(preceding)) {
      r.authRequired = true
      r.authType = "middleware"
      r.reasonings?.push("Spring @PreAuthorize / @Secured / @RolesAllowed détecté")
    }
    const key = `${verb}|${path}`
    if (!seen.has(key)) {
      seen.add(key)
      routes.push(r)
    }
  }

  return routes
}

// ── ASP.NET ───────────────────────────────────────────────────────────────

function detectAspNet(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  // app.MapGet("/path", handler)
  const MAP_RE = /(?:app|endpoints)\.(MapGet|MapPost|MapPut|MapDelete|MapPatch)\s*\(\s*['"]([^'"]+)['"]/g
  for (const m of content.matchAll(MAP_RE)) {
    const method = m[1].replace("Map", "").toUpperCase()
    const r = makeRoute(method, m[2], "")
    routes.push(r)
  }

  // [HttpGet("path")] attribute routing
  const ATTR_RE = /\[(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch)\s*(?:\(\s*['"]([^'"]*)['"]\s*\))?\]/g
  for (const m of content.matchAll(ATTR_RE)) {
    const method = m[1].replace("Http", "").toUpperCase()
    const subPath = m[2] ?? ""

    // [Authorize] detection
    const idx = m.index ?? 0
    const preceding = content.slice(Math.max(0, idx - 300), idx)
    const r = makeRoute(method, subPath || "/", "")
    if (/\[Authorize/.test(preceding)) {
      r.authRequired = true
      r.authType = "middleware"
      r.reasonings?.push("ASP.NET [Authorize] détecté")
    }
    routes.push(r)
  }
  return routes
}

// ── Go ────────────────────────────────────────────────────────────────────

function detectGo(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []

  // net/http: http.HandleFunc("/path", handler) or mux.HandleFunc
  const HTTP_RE = /(?:http|mux|r|router)\s*\.(?:HandleFunc|Handle)\s*\(\s*['"`]([^'"`\s]+)['"`]/g
  for (const m of content.matchAll(HTTP_RE)) {
    routes.push(makeRoute("GET", m[1], ""))
  }

  // gin: r.GET("/path", ...), router.POST(...)
  const GIN_RE = /(?:r|router|engine|group)\s*\.(GET|POST|PUT|DELETE|PATCH|Any)\s*\(\s*['"`]([^'"`\s]+)['"`]/g
  for (const m of content.matchAll(GIN_RE)) {
    const method = m[1] === "Any" ? "GET" : m[1]
    routes.push(makeRoute(method, m[2], ""))
  }

  // echo: e.GET("/path", ...) or g.POST(...)
  const ECHO_RE = /(?:e|echo|g|group)\s*\.(GET|POST|PUT|DELETE|PATCH|Any)\s*\(\s*['"`]([^'"`\s]+)['"`]/g
  for (const m of content.matchAll(ECHO_RE)) {
    const method = m[1] === "Any" ? "GET" : m[1]
    routes.push(makeRoute(method, m[2], ""))
  }

  // fiber: app.Get("/path", ...) or v1.Post(...)
  const FIBER_RE = /(?:app|v\d|group|api)\s*\.(Get|Post|Put|Delete|Patch|All)\s*\(\s*['"`]([^'"`\s]+)['"`]/g
  for (const m of content.matchAll(FIBER_RE)) {
    const method = m[1] === "All" ? "GET" : m[1].toUpperCase()
    routes.push(makeRoute(method, m[2], ""))
  }

  // chi: r.Get("/path", ...) — same pattern as fiber
  return routes
}

// ── Next.js App Router ────────────────────────────────────────────────────

function detectNextjsAppRouter(f: { path: string; content: string }): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const normalizedPath = f.path.replace(/\\/g, "/")

  if (!/\/app\/api\//.test(normalizedPath)) return routes
  if (!/route\.(ts|js|tsx|jsx)$/.test(normalizedPath)) return routes

  const rel = normalizedPath.split("/app/api/")[1]
  let urlPath =
    "/" +
    rel
      .replace(/\/route\.(ts|js|tsx|jsx)$/, "")
      .replace(/index$/, "")
      .replace(/\[\.\.\.([^\]]+)\]/g, ":$1*")
      .replace(/\[([^\]]+)\]/g, ":$1")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "")
  if (urlPath === "") urlPath = "/"
  urlPath = `/api${urlPath}`

  const EXPORT_METHOD_RE = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b([\s\S]{0,2000}?)(?=\nexport|\nconst|\nfunction|$)/g
  for (const m of f.content.matchAll(EXPORT_METHOD_RE)) {
    const method = m[1]
    const body = m[2] || ""
    const r = makeRoute(method, urlPath, "")
    r.sourceFile = f.path

    analyzeHandlerBody(body, r)
    routes.push(r)
  }

  return routes
}

// ── Next.js Pages Router (pages/api/**) ───────────────────────────────────

function detectNextjsPagesRouter(f: { path: string; content: string }): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const normalizedPath = f.path.replace(/\\/g, "/")

  if (!/\/pages\/api\//.test(normalizedPath)) return routes
  if (!/\.(ts|js|tsx|jsx)$/.test(normalizedPath)) return routes

  const rel = normalizedPath.split("/pages/api/")[1]
  let urlPath =
    "/api/" +
    rel
      .replace(/\.(ts|js|tsx|jsx)$/, "")
      .replace(/\/index$/, "")
      .replace(/\[\.\.\.([^\]]+)\]/g, ":$1*")
      .replace(/\[([^\]]+)\]/g, ":$1")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "")

  // Detect HTTP methods from switch/if in default export handler
  const content = f.content
  const methods = new Set<string>()

  // switch (req.method)
  for (const m of content.matchAll(/case\s+['"](\w+)['"]\s*:/g)) {
    const verb = m[1].toUpperCase()
    if (["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"].includes(verb)) {
      methods.add(verb)
    }
  }
  // if (req.method === 'POST')
  for (const m of content.matchAll(/req\.method\s*===?\s*['"](\w+)['"]/g)) {
    methods.add(m[1].toUpperCase())
  }

  if (methods.size === 0) methods.add("GET")

  for (const method of methods) {
    const r = makeRoute(method, urlPath, "")
    r.sourceFile = f.path
    analyzeHandlerBody(content, r)
    routes.push(r)
  }

  return routes
}

// ── Handler body analysis ─────────────────────────────────────────────────

function analyzeHandlerBody(body: string, r: DetectedRoute): void {
  // Auth cookie patterns
  if (/cookies\(\)\.get\(\s*['"](?:token|auth|session|access_token|github_token)['"]\)|request\.cookies\.get\(\s*['"](?:token|auth|session)['"]\)/.test(body)) {
    r.authRequired = true
    r.authType = r.authType || "cookie"
    r.reasonings?.push("Auth token en cookie détecté")
  }

  // Bearer token
  if (/[Aa]uthorization.*[Bb]earer|headers\[['"]authorization['"]\]|getAuthHeader|extractBearerToken/.test(body)) {
    r.authRequired = true
    r.authType = r.authType || "jwt"
    r.reasonings?.push("Bearer token Authorization header détecté")
  }

  // NextAuth getServerSession / getSession
  if (/getServerSession|getSession\(authOptions\)|auth\(\)\s*\.\s*then|const\s+session\s*=\s*await\s+(?:getServerSession|auth)/.test(body)) {
    r.authRequired = true
    r.authType = r.authType || "cookie"
    r.reasonings?.push("NextAuth getServerSession détecté")
  }

  // Clerk
  if (/auth\(\)|currentUser\(\)|clerkClient\.users/.test(body)) {
    r.authRequired = true
    r.authType = r.authType || "middleware"
    r.reasonings?.push("Clerk auth() / currentUser() détecté")
  }

  // Supabase
  if (/supabase\.auth\.getUser|supabase\.auth\.getSession/.test(body)) {
    r.authRequired = true
    r.authType = r.authType || "cookie"
    r.reasonings?.push("Supabase auth.getUser/getSession détecté")
  }

  // 401/403 responses
  if (/(?:status|statusCode)\s*[:=]\s*(?:401|403)|new\s+Response\([^)]*401|NextResponse\.json\([^)]*401|res\.status\(401\)|res\.status\(403\)/.test(body)) {
    if (!r.authRequired) {
      r.authRequired = true
      r.authType = r.authType || "middleware"
      r.reasonings?.push("Réponse 401/403 détectée dans le handler")
    }
  }

  // JSON body
  if (/await\s+req(?:uest)?\.json\(\)|body\s*=\s*await/.test(body)) {
    r.bodyType = "json"
    r.reasonings?.push("Parsing JSON body détecté")
  }

  // Form data
  if (/await\s+req(?:uest)?\.formData\(\)/.test(body)) {
    r.bodyType = "form"
    r.reasonings?.push("Parsing FormData détecté")
  }
}

// ── Auth in route args ────────────────────────────────────────────────────

function detectAuthInArgs(rawArgs: string, r: DetectedRoute): void {
  const lower = rawArgs.toLowerCase()
  if (lower.includes("passport.authenticate")) {
    r.authType = "passport"
    r.authRequired = true
    r.reasonings?.push("passport.authenticate() détecté dans les handlers")
  } else if (/\b(auth|ensureauth|isauthenticated|requireauth|verifyjwt|verifytoken|authenticatejwt|authguard|authorizationguard|isauth|checkauth|withauth|protect|guard)\b/.test(lower)) {
    r.authType = "middleware"
    r.authRequired = true
    r.reasonings?.push("Middleware auth-like détecté dans les handlers")
  }
  if (/\b(?:401|403)\b|unauthorized|forbidden/.test(lower)) {
    if (!r.authRequired) {
      r.authRequired = true
      r.authType = r.authType || "middleware"
      r.reasonings?.push("Réponse 401/403 dans la définition de route")
    }
  }
}

function parseStringList(raw: string): string[] {
  const values: string[] = []
  for (const m of raw.matchAll(/['"]([^'"\]]+)['"]/g)) {
    values.push(m[1])
  }
  return values
}

function parseMethodList(raw: string): string[] {
  const methods = new Set<string>()
  const quoted = parseStringList(raw)
  for (const candidate of quoted) {
    const normalized = candidate.toUpperCase().trim()
    if (normalized) methods.add(normalized)
  }
  for (const m of raw.matchAll(/\bHttpMethod\.([A-Z]+)\b/g)) {
    methods.add(m[1])
  }
  for (const m of raw.matchAll(/\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|ALL)\b/g)) {
    methods.add(m[1])
  }
  return [...methods]
}

function detectAuthByStatusSignal(content: string, r: DetectedRoute): void {
  if (r.authRequired) return
  const pattern = /(?:abort\s*\(\s*(?:401|403)\s*\)|HTTPException\s*\(\s*(?:status_code\s*=\s*)?(?:401|403)\s*\)|raise\s+(?:PermissionDenied|AuthenticationFailed)|return\s+Response\s*\([^)]*status\s*[:=]\s*(?:401|403))/i
  if (pattern.test(content)) {
    r.authRequired = true
    r.authType = r.authType || "middleware"
    r.reasonings?.push("401/403 auth signal détecté")
  }
}

function detectBodyTypeInArgs(rawArgs: string, r: DetectedRoute): void {
  if (/req(?:uest)?\.json\(\)|body\s*=\s*await/.test(rawArgs)) r.bodyType = "json"
  if (/req(?:uest)?\.formData\(\)/.test(rawArgs)) r.bodyType = "form"
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeRoute(method: string, routePath: string, description: string): DetectedRoute {
  return {
    name: "",
    method: method as DetectedRoute["method"],
    path: normalizePath(routePath),
    headers: [],
    body: "",
    bodyType: "none",
    authRequired: false,
    description,
    sourceFile: "",
    controller: null,
    middlewareChain: [],
    authType: null,
    actuallyUsedByFrontend: false,
    reachable: true,
    confidence: "LOW",
    reasonings: [],
    detectedIssues: [],
  }
}

function normalizePath(p: string): string {
  let n = p.trim()
  if (!n.startsWith("/")) n = "/" + n
  n = n
    .replace(/\$\{[^}]+\}/g, ":param")       // ${var} → :param
    .replace(/\{([a-zA-Z_]\w*)\}/g, ":$1")   // {id} → :id  (Spring/ASP.NET style)
    .replace(/<([a-zA-Z_]\w*)(?::[^>]+)?>/g, ":$1") // <int:id> → :id (Flask/Django)
    .replace(/:([a-zA-Z_]\w*)/g, ":$1")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
  return n === "" ? "/" : n
}

function escapeRegExpStr(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// ── Frontend API call scanning ─────────────────────────────────────────────

function scanFrontendApiCalls(files: { path: string; content: string }[]): Set<string> {
  const calledPaths = new Set<string>()

  const patterns: RegExp[] = [
    // fetch('/api/...')
    /\bfetch\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    // axios.get/post/... ('/api/...')
    /\baxios\.(?:get|post|put|delete|patch|request)\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    // ky('/api/...') or ky.get(...)
    /\bky(?:\.(?:get|post|put|delete|patch))?\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    // $fetch('/api/...') — Nuxt
    /\$fetch\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    // useFetch('/api/...') — Nuxt
    /\buseFetch\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    // useSWR('/api/...', ...) — React
    /\buseSWR\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    // useQuery(['/api/...'], ...) — react-query
    /useQuery\s*\(\s*\[\s*(['"`])([^'"`\n]+)\1/g,
    // axios({ url: '/api/...' })
    /\baxios\s*\(\s*\{\s*url\s*:\s*(['"`])([^'"`\n]+)\1/g,
    // createApi or RTK Query endpoints
    /url\s*:\s*(['"`])([^'"`\n]+)\1/g,
  ]

  for (const file of files) {
    const content = file.content
    for (const pattern of patterns) {
      let m
      pattern.lastIndex = 0
      while ((m = pattern.exec(content)) !== null) {
        const called = m[2]
        if (called && called.length > 1 && (called.startsWith("/") || called.startsWith("http"))) {
          // Strip base URL if absolute
          const normalized = normalizePath(
            called.startsWith("http") ? called.replace(/^https?:\/\/[^/]+/, "") : called
          )
          if (normalized && normalized !== "/") {
            calledPaths.add(normalized)
            const withWildcard = normalized.replace(/\$\{[^}]+\}/g, "*")
            if (withWildcard !== normalized) calledPaths.add(withWildcard)
          }
        }
      }
    }

    // Template literal paths like `${API_URL}/users`
    for (const m of content.matchAll(/\$\{[A-Za-z_$][\w$]*\}([/a-z0-9_-]+)/gi)) {
      const pathPart = m[1]
      if (pathPart) calledPaths.add(normalizePath(pathPart))
    }
  }

  return calledPaths
}

function correlateWithFrontendCall(routePath: string, frontendCall: string): boolean {
  if (frontendCall === routePath) return true
  if (frontendCall.endsWith(routePath)) return true
  if (routePath.includes(frontendCall)) return true

  // Param-aware matching: /api/users/:id ↔ /api/users/123
  const routeRegex = new RegExp(
    "^" + routePath.replace(/:[a-zA-Z_]\w*\*/g, ".+").replace(/:[a-zA-Z_]\w*/g, "[^/]+") + "$"
  )
  if (routeRegex.test(frontendCall)) return true

  // Wildcard-normalised
  const normRoute = routePath.replace(/:[a-zA-Z_]\w*/g, "*")
  const normFrontend = frontendCall.replace(/\/\d+/g, "/*")
  if (normRoute === normFrontend) return true

  return false
}

// ── AI analysis ────────────────────────────────────────────────────────────

export async function analyzeWithAI(
  folderPath: string,
  provider: AIProvider,
  apiKey?: string,
): Promise<SavedProject> {
  const staticProject = await analyzeStatic(folderPath)
  const filePaths = await getFiles(folderPath)
  const files: { path: string; content: string }[] = []
  for (const fp of filePaths) {
    try {
      const content = await readTextFile(fp)
      files.push({ path: fp, content })
    } catch {}
  }

  const aiRoutes = await enrichRoutesWithAI(staticProject.routes, provider, apiKey, files)

  return {
    ...staticProject,
    routes: aiRoutes,
    language: staticProject.language,
    mode: "ai",
    analyzedAt: new Date().toISOString(),
  }
}

async function enrichRoutesWithAI(
  routes: DetectedRoute[],
  provider: AIProvider,
  apiKey?: string,
  files: { path: string; content: string }[] = [],
): Promise<DetectedRoute[]> {
  if (routes.length === 0) return routes
  if (provider !== "ollama" && !apiKey) return routes

  function extractSnippet(route: DetectedRoute, maxChars = 2000): string {
    try {
      const file = files.find((f) => f.path === route.sourceFile)
      if (!file) return ""
      const content = file.content
      const pathRegex = route.path.replace(/:[^/]+/g, "[^/]+").replace(/\//g, "\\/")
      const idx = content.search(new RegExp(pathRegex))
      if (idx >= 0) {
        const start = Math.max(0, idx - 600)
        const end = Math.min(content.length, idx + 1000)
        return content.slice(start, end).substring(0, maxChars)
      }
      return content.slice(0, Math.min(content.length, maxChars))
    } catch {
      return ""
    }
  }

  const routeEntries = routes.map((r) => ({
    method: r.method,
    path: r.path,
    sourceFile: r.sourceFile,
    authRequired: r.authRequired,
    authType: r.authType,
    confidence: r.confidence,
    snippet: extractSnippet(r),
  }))

  const message = `You are an API route analysis assistant. Analyze each route below and return ONLY a valid JSON array where each object has:
{
  "method": "GET|POST|PUT|DELETE|PATCH",
  "path": "/api/route/path",
  "description": "brief description",
  "authRequired": boolean,
  "authType": "cookie" | "jwt" | "passport" | "middleware" | null,
  "bodyType": "json" | "form" | "none",
  "middlewareChain": ["middleware1"],
  "controller": "controller_name" | null,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasonings": ["reason1"]
}

Routes:
${routeEntries.map((e) => `Method: ${e.method}, Path: ${e.path}, Source: ${e.sourceFile}, Current Auth: ${e.authRequired ? e.authType || "unknown" : "none"}\nSnippet:\n${e.snippet}`).join("\n---\n")}`

  try {
    const content = await queryAI(provider, apiKey, message)
    const parsed = parseJsonResponse(content)
    if (!Array.isArray(parsed)) return routes

    const routeMap = new Map(parsed.map((item: any) => [`${item.method}|${item.path}`, item]))
    return routes.map((route) => {
      const match = routeMap.get(`${route.method}|${route.path}`)
      if (!match) return route
      return {
        ...route,
        description: typeof match.description === "string" ? match.description : route.description,
        authRequired: typeof match.authRequired === "boolean" ? match.authRequired : route.authRequired,
        bodyType: match.bodyType === "json" || match.bodyType === "form" ? match.bodyType : route.bodyType,
        middlewareChain: Array.isArray(match.middlewareChain) ? match.middlewareChain : route.middlewareChain,
        controller: typeof match.controller === "string" ? match.controller : route.controller,
        authType: typeof match.authType === "string" ? match.authType : route.authType,
        confidence: match.confidence || route.confidence,
        reasonings: Array.isArray(match.reasonings)
          ? [...(route.reasonings || []), ...match.reasonings]
          : route.reasonings,
      }
    })
  } catch {
    return routes
  }
}

function parseJsonResponse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (!match) throw new Error("Impossible d'extraire le JSON")
    return JSON.parse(match[0])
  }
}

async function queryAI(provider: AIProvider, apiKey: string | undefined, message: string): Promise<string> {
  const ollamaConfig = provider === "ollama" ? loadOllamaConfig() : null
  const response = await fetch("/api/proxy-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      apiKey,
      model:
        provider === "anthropic"
          ? "claude-sonnet-4-20250514"
          : provider === "openai"
          ? "gpt-4o"
          : provider === "gemini"
          ? "gemini-2.0-flash"
          : ollamaConfig?.model || "llama2",
      host: ollamaConfig?.host,
      port: ollamaConfig?.port,
      system: `You are an API route analysis assistant. Analyze backend routes and provide structured metadata: authentication, body types, middleware, confidence. Always respond with valid JSON only — no markdown, no prose, just a JSON array.`,
      message,
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Erreur analyse IA")
  return data.content ?? ""
}
