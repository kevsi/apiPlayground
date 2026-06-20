import ts from "typescript"
// Import dynamique pour éviter les erreurs côté client/SSR
let detectRoutesWithTreeSitter: typeof import("./tree-sitter-parser")['detectRoutesWithTreeSitter'] | undefined;
let initTreeSitter: typeof import("./tree-sitter-parser")['initTreeSitter'] | undefined;

async function ensureTreeSitterLoaded() {

  if (!detectRoutesWithTreeSitter || !initTreeSitter) {
    if (typeof window === "undefined") {
      const mod = await import("./tree-sitter-parser");
      detectRoutesWithTreeSitter = mod.detectRoutesWithTreeSitter;
      initTreeSitter = mod.initTreeSitter;
    } else {
      throw new Error("tree-sitter-parser cannot be loaded in the browser/client context");
    }
  }
}

// Shared detection utilities — no Tauri, no "use client"
// Used by: lib/project-analyzer.ts (client/Tauri) AND app/api/github-import/route.ts (server)

import type { HttpMethod } from "@/lib/types"
export type { HttpMethod }

export interface DetectedRoute {
  name: string
  method: HttpMethod
  path: string
  headers: { key: string; value: string }[]
  body: string
  bodyType: "json" | "form" | "none"
  authRequired: boolean
  description: string
  sourceFile: string
  controller?: string | object | null
  middlewareChain?: string[]
  authType?: "none" | "bearer" | "basic" | "oauth" | "api-key" | "jwt" | "session" | "custom" | "middleware" | "cookie" | "passport" | null
  reasonings?: string[]
  actuallyUsedByFrontend?: boolean
  confidence?: "HIGH" | "MEDIUM" | "LOW"
  inferredUsageFrequency?: number | null
  reachable?: boolean
  detectedIssues?: string[]
}

// ── Constants ──────────────────────────────────────────────────────────────

export const FRAMEWORK_FILE_EXTENSIONS: Record<string, string[]> = {
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
  actix: [".rs"],
  axum: [".rs"],
  rocket: [".rs"],
  sinatra: [".rb"],
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

export const IGNORED_FOLDERS = [
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
  "/internals/", "/internal/",
  "webpack.config", "vite.config", "rollup.config",
  "jest.config", "vitest.config", "babel.config",
  ".test.", ".spec.", "-test.", "-spec.",
  ".stories.", ".story.",
]

// ── Helpers ────────────────────────────────────────────────────────────────

export function isNonRouteFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase()
  return NON_ROUTE_PATH_SEGMENTS.some((segment) => normalized.includes(segment))
}

export function normalizePath(p: string): string {
  let n = p.trim()
  if (!n.startsWith("/")) n = "/" + n
  n = n
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/\{([a-zA-Z_]\w*)\}/g, ":$1")
    .replace(/<([a-zA-Z_]\w*)(?::[^>]+)?>/g, ":$1")
    .replace(/:([a-zA-Z_]\w*)/g, ":$1")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
  return n === "" ? "/" : n
}

export function escapeRegExpStr(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function makeRoute(method: string, routePath: string, description: string): DetectedRoute {
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

export function stripLanguageCommentsAndStrings(code: string): string {
  return code
    .replace(/('{3}|"{3})[\s\S]*?\1/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/#.*$/gm, " ")
    .replace(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, " ")
}

export function isRelevantFile(filePath: string, framework: string): boolean {
  if (framework === "unknown") return true
  const exts = FRAMEWORK_FILE_EXTENSIONS[framework]
  if (!exts) return true
  const ext = "." + filePath.split(".").pop()?.toLowerCase()
  return exts.includes(ext)
}

// ── Language detection ──────────────────────────────────────────────────────

export function detectLanguage(files: { path: string; content: string }[]): string {
  const counts: Record<string, number> = {}
  for (const file of files) {
    const ext = file.path.split(".").pop()?.toLowerCase() || ""
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

  if (/from\s+fastapi\s+import|FastAPI\s*\(|@app\.get|@router\.post/.test(all)) return "Python"
  if (/from\s+flask\s+import|@app\.route|Flask\(/.test(all)) return "Python"
  if (/from\s+django\.|from\s+rest_framework|urlpatterns\s*=\s*\[|@login_required/.test(all)) return "Python"
  if (/from\s+tornado\\.web|RequestHandler/.test(all)) return "Python"
  if (/from\s+sanic\.|Sanic\(|from\s+litestar\.|Litestar\s*\(|from\s+starlette\.|uvicorn\.|asgi\//.test(all)) return "Python"
  if (/Rails\.application\.routes\.draw|class.*<\s*ApplicationController|def\s+create/.test(all)) return "Ruby"
  if (/Sinatra::|get\s+['"]\//.test(all)) return "Ruby"
  if (/package\s+main/.test(all) && (/func\s+main\(\)|http\.HandleFunc|mux\.HandleFunc|router\.GET/.test(all))) return "Go"
  if (/gin\.|echo\.|fiber\.|chi\./.test(all)) return "Go"
  if (/(?:@RestController|@RequestMapping|@GetMapping|@PostMapping|@PutMapping|@DeleteMapping)/.test(sanitized) && /(?:org\.springframework|spring\.boot\.)/.test(sanitized)) return "Java"
  if (/@SpringBootApplication|spring\.boot\./.test(sanitized)) return "Java"
  if (/(?:io\.micronaut\.|@MicronautApplication|micronaut\.http\.|@Controller\(|@(Get|Post|Put|Delete|Patch)\b)/.test(sanitized) && /(?:io\.micronaut\.|micronaut\.)/.test(sanitized)) return "Java"
  if (/(?:io\.quarkus\.|quarkus\.|@QuarkusMain|@Path\(|(?:javax|jakarta)\.ws\.rs\.)/.test(sanitized)) return "Java"
  if (/WebApplication\.CreateBuilder\(|MapGet\(|MapPost\(|app\.MapControllers|namespace.*Microsoft/.test(all)) return "CSharp"
  if (/\.NET|ASP\.NET|IActionResult|[Cc]ontroller\s*:\s*Controller/.test(all)) return "CSharp"
  if (/fun\s+main\(/.test(all) && /val\s+|var\s+/.test(all) && /object|class/.test(all)) return "Kotlin"
  if (/ktor\.|routing\s*\{/.test(all)) return "Kotlin"
  if (/import\s+Vapor|Vapor\.|Application\(|app\.http|app\.(?:get|post|put|delete|patch)\s*\(/.test(all)) return "Swift"
  if (/func\s+routes\(|router\.(?:get|post|put|delete|patch)|AsyncHTTPServer/.test(all)) return "Swift"
  if (/fn\s+main\(\)|use\s+axum|use\s+actix|use\s+rocket|axum::|actix_web::|rocket::/.test(all)) return "Rust"
  if (/#\[tokio::main\]|#\[actix_web::|#\[rocket::main\]/.test(all)) return "Rust"
  if (/Route::|Laravel|Illuminate|app\/Http\/Controllers/.test(all)) return "PHP"
  if (/@php\/framework|<?php|function\s+store\(Request/.test(all)) return "PHP"
  if (/\bconsole\.log\(|\bimport\s+React|export\s+default|require\(/.test(sanitized)) return "JavaScript"
  if (/from\s+['"](express|next|fastify|koa)['"]|app\.get\(|app\.post\(/.test(sanitized)) return "JavaScript"
  if (/mix\.exs|Phoenix\.Router|use\s+Phoenix|plug\.|phoenix\./i.test(all)) return "Elixir"
  if (/import\s+Network\.Wai|import\s+Servant|servant-server|warp\.|wai\./i.test(all)) return "Haskell"
  return "Unknown"
}

// ── Framework detection ────────────────────────────────────────────────────

export function detectFramework(files: { path: string; content: string }[]): string {
  if (files.length === 0) return "unknown"
  
  // 1. Chercher d'abord package.json (plus fiable)
  const pkgJson = files.find(f => f.path.endsWith("package.json"))
  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson.content)
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps.next || deps["next-auth"]) return "nextjs"
      if (deps.express) return "express"
      if (deps.fastify) return "fastify"
      if (deps.koa) return "koa"
      if (deps["@hapi/hapi"]) return "hapi"
      if (deps["@nestjs/core"] || deps["@nestjs/common"]) return "nestjs"
      if (deps.fastapi) return "fastapi"
      if (deps.flask) return "flask"
      if (deps.django) return "django"
      if (deps.tornado) return "tornado"
      if (deps.sanic) return "sanic"
      if (deps.starlette) return "starlette"
      if (deps.litestar || deps.starlite) return "litestar"
      if (deps.aiohttp) return "aiohttp"
      if (deps.falcon) return "falcon"
      if (deps.rails) return "rails"
      if (deps.sinatra) return "sinatra"
      if (deps["@phoenix/phoenix"]) return "phoenix"
      if (deps["spring-boot"]) return "spring"
      if (deps.micronaut) return "micronaut"
      if (deps.quarkus) return "quarkus"
      if (deps["asp.net"] || deps["dotnet"]) return "aspnet"
      if (deps.gin || deps.echo || deps.fiber || deps.chi || deps["github.com/gin-gonic/gin"]) return "go"
      if (deps.ktor) return "kotlin"
      if (deps.vapor) return "swift"
      if (deps.axum || deps.actix || deps.rocket) return "rust"
      if (deps.servant || deps.warp) return "haskell"
      if (deps.laravel || deps["laravel/framework"]) return "laravel"
    } catch {}
  }
  
  // 2. Chercher dans les fichiers de config
  const paths = files.map((f) => f.path.replace(/\\/g, "/")).join("\n")
  const all = files.map((f) => f.content).join("\n")
  const sanitized = stripLanguageCommentsAndStrings(all)
  
  if (/next\.config\.(js|ts|mjs)/.test(paths)) return "nextjs"
  if (/composer\.json/.test(paths) && /laravel/.test(all)) return "laravel"
  if (/mix\.exs/.test(paths)) return "phoenix"
  if (/go\.mod|go\.sum/.test(paths)) return "go"
  if (/Cargo\.toml/.test(paths)) return "rust"
  if (/Gemfile|\.rb$/.test(paths)) return "rails"
  if (/pom\.xml|build\.gradle/.test(paths)) return "spring"
  if (/\.kt$/.test(paths)) return "kotlin"
  if (/pyproject\.toml|requirements\.txt|setup\.py/.test(paths)) return "fastapi"
  
  // 3. Patterns robustes (flexible avec espaces)
  const flexible = (pattern: RegExp) => new RegExp(pattern.source.replace(/\\s\+/g, "\\s*"), pattern.flags)
  
  if (/from\s+['"]?next['"]?|next\/(?:server|router|link)|next\.config/.test(sanitized)) return "nextjs"
  if (/require\s*\(\s*['"]express['"]|from\s+['"]express['"]|app\s*\.\s*(?:get|post|put|patch|delete)\s*\(|router\s*\.\s*(?:get|post)\s*\(/.test(sanitized)) return "express"
  if (/from\s+['"]fastify['"]|fastify\s*\(|fastify\s*\.\s*(?:get|post|put|delete)/.test(sanitized)) return "fastify"
  if (/from\s+['"]koa['"]|new\s+Koa\s*\(/.test(sanitized)) return "koa"
  if (/@hapi\/hapi|Hapi\s*\.\s*server\(|server\s*\.\s*(?:start|route)\(/.test(sanitized)) return "hapi"
  if (/@nestjs\/|@Controller\s*\(|@Get\s*\(|@Post\s*\(|@UseGuards|@UseMiddleware/.test(all)) return "nestjs"
  if (/from\s+fastapi|FastAPI\s*\(|@app\s*\.\s*(?:get|post|put|delete|patch)|@router\s*\.\s*(?:get|post|put|delete|patch)/.test(all)) return "fastapi"
  if (/from\s+flask|@(?:[A-Za-z_][\w.]*\s*\.\s*)?(?:route|get|post|put|delete|patch)\s*\(|Flask\s*\(/.test(all)) return "flask"
  if (/from\s+django|from\s+rest_framework|urlpatterns\s*=\s*\[|@(?:login_required|permission_required|user_passes_test)/.test(all)) return "django"
  if (/from\s+tornado\\.web|RequestHandler\b/.test(all)) return "tornado"
  if (/from\s+(?:litestar|starlite)|(?:Litestar|Starlite)\s*\(/.test(all)) return "litestar"
  if (/from\s+starlette|Route\s*\(|Mount\s*\(/.test(all)) return "starlette"
  if (/from\s+sanic|Sanic\s*\(/.test(all)) return "sanic"
  if (/from\s+aiohttp|aiohttp\\.web\.Application|app\s*\.\s*router\s*\.\s*add_/.test(all)) return "aiohttp"
  if (/from\s+falcon|falcon\.API|app\s*\.\s*add_route|on_(?:get|post|put|patch|delete)\s*\(/.test(all)) return "falcon"
  if (/Rails\.application\.routes\.draw|class\s+\w+\s*<\s*ApplicationController/.test(all)) return "rails"
  if (/Sinatra\s*::|^get\s+['"]\/|^post\s+['"]\//.test(all)) return "sinatra"
  if (/Phoenix\.Router|use\s+Phoenix|plug\s*\.|phoenix\./.test(all)) return "phoenix"
  if (/(?:@RestController|@RequestMapping|@GetMapping|@PostMapping)\s*\(/.test(sanitized) && /org\.springframework/.test(sanitized)) return "spring"
  if (/io\.micronaut\.|@MicronautApplication|@Controller\s*\(/.test(sanitized)) return "micronaut"
  if (/io\.quarkus\.|@QuarkusMain|@Path\s*\(|javax\.ws\.rs|jakarta\.ws\.rs/.test(sanitized)) return "quarkus"
  if (/(?:@RestController|@Controller|@GetMapping|@PostMapping)\s*\(/.test(sanitized)) return "spring"
  if (/WebApplication\.CreateBuilder|MapGet\s*\(|MapPost\s*\(|app\.MapControllers|Microsoft\.AspNetCore/.test(sanitized)) return "aspnet"
  if (/package\s+main\b/.test(all) && /(?:func\s+main\(\)|http\.HandleFunc|mux\.HandleFunc)/.test(all)) return "go"
  if (/(?:gin\.|echo\.|fiber\.|chi\.|gorilla\/mux\.Router)/.test(all) && /func\s+main\(\)/.test(all)) return "go"
  if (/fun\s+main\s*\(/.test(all) && /(?:ktor\.|routing\s*\{)/.test(all)) return "kotlin"
  if (/import\s+Vapor|Application\s*\(|app\.http|routes\s*\(/.test(all)) return "swift"
  if (/fn\s+main\s*\(|#\[tokio::main\]|use\s+(?:axum|actix|rocket)|(?:axum|actix_web|rocket)\s*::/.test(all)) return "rust"
  if (/import\s+(?:Servant|Wai\.Application)|servant\-server|warp\s*::/.test(all)) return "haskell"
  if (/Route::|Illuminate\\\\|app\/Http\/Controllers|Laravel/.test(all)) return "laravel"
  
  return "unknown"
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

export function detectPort(files: { path: string; content: string }[]): number | undefined {
  const all = files.map((f) => f.content).join("\n")
  for (const p of PORT_PATTERNS) {
    p.lastIndex = 0
    const m = p.exec(all)
    if (m) return parseInt(m[1], 10)
  }
  return undefined
}

export function defaultPortForFramework(framework: string): number | undefined {
  const ports: Record<string, number> = {
    fastapi: 8000, flask: 5000, django: 8000,
    express: 3000, nextjs: 3000, nestjs: 3000,
    laravel: 8000, rails: 3000,
    spring: 8080, quarkus: 8080, micronaut: 8080, aspnet: 5000, go: 8080,
  }
  return ports[framework]
}

// ── Framework-specific route detectors ────────────────────────────────────

function parseTSContent(content: string): ts.SourceFile {
  return ts.createSourceFile("detect.ts", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function getStringLiteralValue(node: ts.Expression | undefined): string | null {
  if (!node) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text
    for (const span of node.templateSpans) {
      text += ":param"
      text += span.literal.text
    }
    return text
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = getStringLiteralValue(node.left)
    const right = getStringLiteralValue(node.right)
    return left !== null && right !== null ? left + right : null
  }
  return null
}

function getObjectLiteralPropertyString(node: ts.ObjectLiteralExpression, key: string): string | null {
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const name = ts.isIdentifier(prop.name) ? prop.name.text : ts.isStringLiteral(prop.name) ? prop.name.text : null
    if (name !== key) continue
    return getStringLiteralValue(prop.initializer)
  }
  return null
}

const HTTP_METHODS_LOWER = new Set(["get", "post", "put", "delete", "patch", "options", "head"])
const HTTP_METHODS_UPPER = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
const HTTP_METHODS_UPPER_ALL = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD", "ALL"])

function isHttpMethodName(name: string): boolean {
  return HTTP_METHODS_LOWER.has(name.toLowerCase()) || name.toLowerCase() === "all"
}

function detectExpressAST(content: string): DetectedRoute[] {
  const sourceFile = parseTSContent(content)
  const appVars = new Set<string>(["app"])
  const routerVars = new Set<string>(["router"])
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()

  function addRoute(method: string, path: string, middlewares?: string[]) {
    const normalized = normalizePath(path)
    const key = `${method}|${normalized}`
    if (!seen.has(key)) {
      seen.add(key)
      const route = makeRoute(method as HttpMethod, normalized, "")
      if (middlewares && middlewares.length > 0) {
        route.middlewareChain = middlewares
        route.reasonings?.push("Middleware inlines detectes dans la declaration de route")
        if (middlewares.some((m) => /auth|jwt|token|passport|session|guard|verify|secure|protect/i.test(m))) {
          route.authRequired = true
          route.authType = "middleware"
        }
      }
      routes.push(route)
    }
  }

  function extractRoutePathFromChain(chainExpr: ts.Expression): string | null {
    if (ts.isCallExpression(chainExpr) && ts.isPropertyAccessExpression(chainExpr.expression)) {
      const innerCall = chainExpr.expression.expression
      const propName = chainExpr.expression.name.text
      if (propName === "route" && ts.isCallExpression(innerCall)) {
        return getStringLiteralValue(innerCall.arguments[0])
      }
      if (propName === "route" && ts.isIdentifier(innerCall)) {
        return getStringLiteralValue(chainExpr.arguments[0])
      }
      if (propName === "all") return null
      return extractRoutePathFromChain(innerCall)
    }
    return null
  }

  function getMiddlewaresFromCall(node: ts.CallExpression): string[] {
    const mws: string[] = []
    for (let i = 1; i < node.arguments.length; i++) {
      const arg = node.arguments[i]
      if (ts.isIdentifier(arg)) {
        mws.push(arg.text)
      } else if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression)) {
        mws.push(arg.expression.text)
      } else if (ts.isStringLiteral(arg)) {
        mws.push(arg.text)
      }
    }
    return mws
  }

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "express") {
        appVars.add(node.name.text)
      }
      if (ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression) && init.expression.name.text === "Router") {
        routerVars.add(node.name.text)
      }
      if (ts.isNewExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "Router") {
        routerVars.add(node.name.text)
      }
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text
      const receiver = node.expression.expression
      const pathArg = getStringLiteralValue(node.arguments[0])

      if (pathArg && isHttpMethodName(methodName)) {
        if (ts.isIdentifier(receiver) && (appVars.has(receiver.text) || routerVars.has(receiver.text))) {
          const mws = getMiddlewaresFromCall(node)
          addRoute(methodName.toUpperCase(), pathArg, mws.length > 0 ? mws : undefined)
        } else if (ts.isCallExpression(receiver)) {
          const chainedPath = extractRoutePathFromChain(receiver)
          if (chainedPath) {
            const mws = getMiddlewaresFromCall(node)
            addRoute(methodName.toUpperCase(), chainedPath, mws.length > 0 ? mws : undefined)
          }
        }
      }

      if (methodName === "route" && pathArg && ts.isIdentifier(receiver) && (appVars.has(receiver.text) || routerVars.has(receiver.text))) {
        const routePath = pathArg
        let current: ts.Node = node.parent
        while (current) {
          if (ts.isPropertyAccessExpression(current) && isHttpMethodName(current.name.text) && ts.isCallExpression(current.parent)) {
            const mws = getMiddlewaresFromCall(current.parent as ts.CallExpression)
            addRoute(current.name.text.toUpperCase(), routePath, mws.length > 0 ? mws : undefined)
            current = current.parent.parent
          } else {
            break
          }
        }
      }

      if (methodName === "use" && pathArg && ts.isIdentifier(receiver) && (appVars.has(receiver.text) || routerVars.has(receiver.text))) {
        for (let i = 1; i < node.arguments.length; i++) {
          const arg = node.arguments[i]
          if (ts.isIdentifier(arg) && routerVars.has(arg.text)) {
            const subRouterPath = pathArg
            const connRoutes: { method: string; path: string }[] = []
            ts.forEachChild(sourceFile, (child) => {
              if (ts.isExpressionStatement(child) && ts.isCallExpression(child.expression)) {
                const expr = child.expression
                if (ts.isPropertyAccessExpression(expr.expression) && ts.isIdentifier(expr.expression.expression) && expr.expression.expression.text === arg.text) {
                  const m = expr.expression.name.text
                  if (isHttpMethodName(m)) {
                    const p = getStringLiteralValue(expr.arguments[0])
                    if (p) connRoutes.push({ method: m.toUpperCase(), path: p })
                  }
                }
              }
            })
            for (const cr of connRoutes) {
              addRoute(cr.method, normalizePath(`${subRouterPath}/${cr.path}`))
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return routes
}

function detectFastifyAST(content: string): DetectedRoute[] {
  const sourceFile = parseTSContent(content)
  const appNames = new Set<string>(["fastify", "app", "server"])
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()

  function addRoute(method: string, path: string) {
    const normalized = normalizePath(path)
    const key = `${method}|${normalized}`
    if (!seen.has(key)) {
      seen.add(key)
      routes.push(makeRoute(method as HttpMethod, normalized, ""))
    }
  }

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "fastify") {
        appNames.add(node.name.text)
      }
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text
      const receiver = node.expression.expression
      const pathArg = getStringLiteralValue(node.arguments[0])

      if (pathArg && ts.isIdentifier(receiver) && appNames.has(receiver.text) && isHttpMethodName(methodName)) {
        addRoute(methodName.toUpperCase(), pathArg)
      }

      if (methodName === "route" && ts.isIdentifier(receiver) && appNames.has(receiver.text) && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
        const config = node.arguments[0]
        const url = getObjectLiteralPropertyString(config, "url") || getObjectLiteralPropertyString(config, "path")
        const method = getObjectLiteralPropertyString(config, "method")
        if (url) {
          if (method) {
            addRoute(method.toUpperCase(), url)
          } else {
            addRoute("GET", url)
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return routes
}

function detectKoaAST(content: string): DetectedRoute[] {
  const sourceFile = parseTSContent(content)
  const routerNames = new Set<string>(["router"])
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()

  function addRoute(method: string, path: string) {
    const normalized = normalizePath(path)
    const key = `${method}|${normalized}`
    if (!seen.has(key)) {
      seen.add(key)
      routes.push(makeRoute(method as HttpMethod, normalized, ""))
    }
  }

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer
      if ((ts.isNewExpression(init) || ts.isCallExpression(init)) && ts.isIdentifier(init.expression) && init.expression.text === "Router") {
        routerNames.add(node.name.text)
      }
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text
      const receiver = node.expression.expression
      const pathArg = getStringLiteralValue(node.arguments[0])
      if (pathArg && ts.isIdentifier(receiver) && routerNames.has(receiver.text) && isHttpMethodName(methodName)) {
        addRoute(methodName.toUpperCase(), pathArg)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return routes
}

function detectHapiAST(content: string): DetectedRoute[] {
  const sourceFile = parseTSContent(content)
  const serverNames = new Set<string>(["server"])
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()

  function addRoute(method: string, path: string) {
    const normalized = normalizePath(path)
    const key = `${method}|${normalized}`
    if (!seen.has(key)) {
      seen.add(key)
      routes.push(makeRoute(method as HttpMethod, normalized, ""))
    }
  }

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer
      if (ts.isNewExpression(init) && ts.isPropertyAccessExpression(init.expression) && init.expression.name.text === "Server") {
        serverNames.add(node.name.text)
      }
      if (ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression) && init.expression.name.text === "server") {
        serverNames.add(node.name.text)
      }
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "route") {
      const receiver = node.expression.expression
      if (ts.isIdentifier(receiver) && serverNames.has(receiver.text) && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
        const config = node.arguments[0]
        const method = getObjectLiteralPropertyString(config, "method") || "GET"
        const path = getObjectLiteralPropertyString(config, "path") || getObjectLiteralPropertyString(config, "url")
        if (path) addRoute(method.toUpperCase(), path)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return routes
}

export function detectExpress(content: string): DetectedRoute[] {
  const astRoutes = detectExpressAST(content)
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  const appVars = new Set<string>(["app"])
  const routerVars = new Set<string>()
  for (const m of content.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\s*\(\s*\)/g)) {
    appVars.add(m[1])
  }
  for (const m of content.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:(?:new\s+)?(?:express\.Router|Router)\s*\(\s*\)|require\s*\(\s*['"`]express['"`]\s*\)\s*\(\s*\)|import\s*\(\s*['"`]express['"`]\s*\))/g)) {
    routerVars.add(m[1])
  }
  const isAppObject = (obj: string) => obj === "app" || appVars.has(obj)
  const isRouterObject = (obj: string) => obj === "router" || routerVars.has(obj)
  const METHOD_RE = /([A-Za-z_$][\w$]*)\.(get|post|put|delete|patch|options|head|all)\s*\(\s*(['"`])((?:[^'"`\\]|\\.|(?!\3)[\s\S])*?)\3\s*,?([\s\S]*?)(?=\)\s*(?:;|\n|\/\/|app\.|router\.|[A-Za-z_$][\w$]*\.)|\n\n)/g
  for (const m of content.matchAll(METHOD_RE)) {
    try {
      const obj = m[1]; const method = m[2].toUpperCase(); const rawPath = m[4]; const rawArgs = m[5] || ""
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
      if (!seen.has(key)) { seen.add(key); routes.push(r) }
    } catch {}
  }
  const ROUTE_CHAIN_RE = /([A-Za-z_$][\w$]*)\.route\s*\(\s*(['"`])((?:[^'"`\\]|\\.)*?)\2\s*\)\s*((?:\s*\.\s*(?:get|post|put|delete|patch|options|head|all)\s*\(\s*[\s\S]*?\))+)/g
  for (const m of content.matchAll(ROUTE_CHAIN_RE)) {
    const obj = m[1]; if (!isAppObject(obj) && !isRouterObject(obj)) continue
    const rawPath = m[3]; const chain = m[4]; const resolvedPath = rawPath.replace(/\$\{[^}]+\}/g, ":param")
    for (const mm of chain.matchAll(/\.\s*(get|post|put|delete|patch|options|head|all)\s*\(/g)) {
      const method = mm[1].toUpperCase(); const path = normalizePath(resolvedPath); const key = `${method}|${path}`
      if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, resolvedPath, "")) }
    }
  }
  const SIMPLE_RE = /(?:app|router|[A-Za-z_$][\w$]*)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"]+)['"]\)/g
  for (const m of content.matchAll(SIMPLE_RE)) {
    const obj = m[0].split(".")[0]
    if (!isAppObject(obj) && !isRouterObject(obj)) continue
    const key = `${m[1].toUpperCase()}|${normalizePath(m[2])}`
    if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(m[1].toUpperCase(), m[2], "")) }
  }
  return routes
}

export function detectFastify(content: string): DetectedRoute[] {
  const astRoutes = detectFastifyAST(content)
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const seen = new Set<string>()
  const INLINE_RE = /(?:fastify|server|app)\.(get|post|put|delete|patch|options|head|all)\s*\(\s*(['"`])((?:[^'"`\\]|\\.)*?)\2/g
  for (const m of sanitized.matchAll(INLINE_RE)) {
    const method = m[1].toUpperCase(); const rawPath = m[3]; const key = `${method}|${normalizePath(rawPath)}`
    if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, rawPath, "")) }
  }
  const ROUTE_OBJ_RE = /(?:fastify|server|app)\.route\s*\(\s*\{([\s\S]*?)\}\s*\)/g
  for (const m of sanitized.matchAll(ROUTE_OBJ_RE)) {
    const block = m[1]; const methodMatch = block.match(/method\s*:\s*['"]([^'"]+)['"]/i)
    const urlMatch = block.match(/(?:url|path)\s*:\s*['"]([^'"]+)['"]/i)
    if (methodMatch && urlMatch) {
      const method = methodMatch[1].toUpperCase(); const rawPath = urlMatch[1]; const key = `${method}|${normalizePath(rawPath)}`
      if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, rawPath, "")) }
    }
  }
  return routes
}

export function detectKoa(content: string): DetectedRoute[] {
  const astRoutes = detectKoaAST(content)
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const routerVars = new Set<string>()
  for (const m of sanitized.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Router\s*\(/g)) { routerVars.add(m[1]) }
  const METHOD_RE = /([A-Za-z_$][\w$]*)\.(get|post|put|delete|patch|options|head)\s*\(\s*(['"`])((?:[^'"`\\]|\\.)*?)\3/g
  const seen = new Set<string>()
  for (const m of sanitized.matchAll(METHOD_RE)) {
    const obj = m[1]; const method = m[2].toUpperCase(); const rawPath = m[4]
    if (obj !== "router" && !routerVars.has(obj)) continue
    const key = `${method}|${normalizePath(rawPath)}`
    if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, rawPath, "")) }
  }
  return routes
}

export function detectKtor(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const seen = new Set<string>()
  const DIRECT_RE = /\b(get|post|put|delete|patch|options|head)\s*\(\s*(['"])([^'"\s][^'"\)]*)\2/g
  for (const m of sanitized.matchAll(DIRECT_RE)) {
    const method = m[1].toUpperCase(); const rawPath = m[3]; const key = `${method}|${normalizePath(rawPath)}`
    if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, rawPath, "")) }
  }
  const PREFIX_RE = /route\s*\(\s*(['"])([^'"\s][^'"\)]*)\1\s*\)\s*\{([\s\S]*?)\}/g
  for (const m of sanitized.matchAll(PREFIX_RE)) {
    const prefix = m[2]; const block = m[3]
    for (const inner of block.matchAll(DIRECT_RE)) {
      const method = inner[1].toUpperCase(); const rawPath = normalizePath(`${prefix}/${inner[3]}`);
      const key = `${method}|${rawPath}`
      if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, rawPath, "")) }
    }
  }
  return routes
}

export function detectHapi(content: string): DetectedRoute[] {
  const astRoutes = detectHapiAST(content)
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const seen = new Set<string>()
  const ROUTE_OBJ_RE = /server\.route\s*\(\s*\{([\s\S]*?)\}\s*\)/g
  for (const m of sanitized.matchAll(ROUTE_OBJ_RE)) {
    const block = m[1]; const methodMatch = block.match(/method\s*:\s*['"]([^'"]+)['"]/i)
    const pathMatch = block.match(/path\s*:\s*['"]([^'"]+)['"]/i)
    if (methodMatch && pathMatch) {
      const method = methodMatch[1].toUpperCase(); const rawPath = pathMatch[1]; const key = `${method}|${normalizePath(rawPath)}`
      if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, rawPath, "")) }
    }
  }
  const ROUTE_ARRAY_RE = /server\.route\s*\(\s*\[([\s\S]*?)\]\s*\)/g
  for (const m of sanitized.matchAll(ROUTE_ARRAY_RE)) {
    const arrayBlock = m[1]
    const ITEMS_RE = /\{([\s\S]*?)\}/g
    for (const item of arrayBlock.matchAll(ITEMS_RE)) {
      const block = item[1]; const methodMatch = block.match(/method\s*:\s*['"]([^'"]+)['"]/i)
      const pathMatch = block.match(/path\s*:\s*['"]([^'"]+)['"]/i)
      if (methodMatch && pathMatch) {
        const method = methodMatch[1].toUpperCase(); const rawPath = pathMatch[1]; const key = `${method}|${normalizePath(rawPath)}`
        if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, rawPath, "")) }
      }
    }
  }
  return routes
}

export function detectFastAPI(content: string): DetectedRoute[] {
  const astRoutes = detectPythonRoutesAST(content, "fastapi")
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const routerPrefixMap = new Map<string, string>()
  
  // More robust router prefix patterns
  const APIRouter_PREFIX_RE = /([A-Za-z_][\w]*)\s*=\s*APIRouter\s*\(\s*(?:[^)]*\s+)?prefix\s*[:=]\s*['\"]([^'\"]+)['\"][\s\S]*?\)/g
  for (const m of sanitized.matchAll(APIRouter_PREFIX_RE)) { 
    routerPrefixMap.set(m[1], m[2]) 
  }
  
  const INCLUDE_ROUTER_RE = /\.include_router\s*\(\s*([A-Za-z_][\w]*)\s*(?:,\s*prefix\s*=\s*['\"]([^'\"]+)['\"])?/g
  for (const m of sanitized.matchAll(INCLUDE_ROUTER_RE)) {
    const routerName = m[1]
    const includePrefix = m[2]
    const existing = routerPrefixMap.get(routerName)
    const prefixToSet = includePrefix ? (existing ? normalizePath(`${includePrefix}/${existing}`) : includePrefix) : existing
    if (prefixToSet) routerPrefixMap.set(routerName, prefixToSet)
  }
  
  // Primary decorator pattern: @router.get(), @app.post(), etc.
  const FASTAPI_RE = /@([A-Za-z_][\w]*)\s*\.\s*(?:get|post|put|delete|patch|options|head)\s*\(\s*(['"`])((?:[^'"`\\]|\\.|[\s\S])*?)\3\s*,?([\s\S]*?)(?=\n\s*@|\n\s*(?:async\s+)?def\s|$)/gi
  for (const m of sanitized.matchAll(FASTAPI_RE)) {
    const target = m[1]
    const method = m[0].match(/\.(get|post|put|delete|patch|options|head)/i)?.[1]?.toUpperCase() || "GET"
    const routePath = m[3]
    const decoratorArgs = m[4] || ""
    
    const r = makeRoute(method as HttpMethod, routePath, "")
    r.controller = target
    
    const hasDependsAuth = /Depends\s*\(\s*(?:get_current_user|oauth2_scheme|verify_token|auth|jwt|token)/i.test(decoratorArgs)
      || /dependencies\s*=\s*\[.*?Depends\s*\(\s*(?:get_current_user|oauth2_scheme|verify_token|auth|jwt|token)/i.test(decoratorArgs)
    if (hasDependsAuth) { 
      r.authRequired = true
      r.authType = "jwt"
      r.reasonings?.push("FastAPI Depends() auth detected")
    }
    
    if (/response_model\s*=/.test(decoratorArgs)) r.reasonings?.push("response_model specified")
    if (/status_code\s*=/.test(decoratorArgs)) r.reasonings?.push("status_code specified")
    
    // Extract function signature for more info
    const after = sanitized.slice((m.index ?? 0) + m[0].length)
    const fnMatch = after.match(/\n\s*(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(([^)]*)\)/m)
    const params = fnMatch?.[1] ?? ""
    
    if (params) {
      if (/\bUploadFile\b/.test(params)) { r.bodyType = "form"; r.reasonings?.push("UploadFile detected") }
      else if (/\bFile\s*\(/.test(params)) { r.bodyType = "form"; r.reasonings?.push("File(...) detected") }
      else if (/\bForm\s*\(/.test(params)) { r.bodyType = "form"; r.reasonings?.push("Form(...) detected") }
      else if (!/\bQuery\s*\(|\bPath\s*\(|\bDepends\s*\(|\bHeader\s*\(/.test(params) && /:\s*[A-Za-z_][\w.<>\[\]]*/.test(params)) { 
        r.bodyType = "json"
        r.reasonings?.push("Body JSON detected")
      }
      
      if (/Depends\s*\(\s*(?:get_current_user|oauth2_scheme|verify_token|auth|jwt|token)/i.test(params)) { 
        r.authRequired = true
        r.authType = "jwt"
        r.reasonings?.push("FastAPI Depends() in signature")
      }
    }
    
    const routerPrefix = routerPrefixMap.get(target)
    if (routerPrefix) r.path = normalizePath(`${routerPrefix}/${r.path}`)
    
    detectAuthByStatusSignal(content, r)
    const key = `${r.method}|${r.path}`
    if (!routes.some(route => `${route.method}|${route.path}` === key)) {
      routes.push(r)
    }
  }
  
  // Fallback: simpler pattern
  const SIMPLE_RE = /@(?:router|app)\s*\.\s*(?:get|post|put|delete|patch|options|head)\s*\(\s*['"]([^'"]+)['"]/gi
  const seenKeys = new Set(routes.map((r) => `${r.method}|${r.path}`))
  for (const m of sanitized.matchAll(SIMPLE_RE)) {
    const method = m[0].match(/\.(get|post|put|delete|patch|options|head)/i)?.[1]?.toUpperCase() || "GET"
    const path = normalizePath(m[1])
    const key = `${method}|${path}`
    if (!seenKeys.has(key)) { 
      seenKeys.add(key)
      const r = makeRoute(method as HttpMethod, path, "")
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }
  
  return routes
}

export function detectFlask(content: string): DetectedRoute[] {
  const astRoutes = detectPythonRoutesAST(content, "flask")
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const blueprintPrefix = new Map<string, string>(); const methodViewMethods = new Map<string, string[]>()
  const REGISTER_BP_RE = /app\.register_blueprint\s*\(\s*([A-Za-z_][\w]*)\s*,\s*url_prefix\s*=\s*['\"]([^'\"]+)['\"]\s*\)/g
  for (const m of sanitized.matchAll(REGISTER_BP_RE)) { blueprintPrefix.set(m[1], m[2]) }
  const BLUEPRINT_DEF_RE = /([A-Za-z_][\w]*)\s*=\s*Blueprint\s*\(\s*['\"][^'\"\s]+['\"]\s*,[\s\S]*?url_prefix\s*=\s*['\"]([^'\"]+)['\"]/g
  for (const m of sanitized.matchAll(BLUEPRINT_DEF_RE)) { blueprintPrefix.set(m[1], m[2]) }
  const METHOD_VIEW_CLASS_RE = /class\s+([A-Za-z_][\w]*)\s*\(\s*MethodView\s*\)[\s\S]*?(?=\nclass\s|\n\n|$)/g
  for (const m of sanitized.matchAll(METHOD_VIEW_CLASS_RE)) {
    const className = m[1]; const body = m[0]
    const methods = Array.from(body.matchAll(/def\s+(get|post|put|delete|patch)\s*\(/g)).map((x) => x[1].toUpperCase())
    if (methods.length) methodViewMethods.set(className, methods)
  }
  const ROUTE_RE = /@([A-Za-z_][\w.]*)\.(route|get|post|put|delete|patch|options|head|add_url_rule)\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of content.matchAll(ROUTE_RE)) {
    const decoratorTarget = m[1]; const methodName = m[2]; let routePath = m[3]; const args = m[4] || ""
    const methods = methodName === "route" || methodName === "add_url_rule"
      ? (() => { const result = parseMethodList(args); return result.length ? result : ["GET"] })()
      : [methodName.toUpperCase()]
    const viewClassName = args.match(/([A-Za-z_][\w]*)\.as_view\(/)?.[1]
    if (methodName === "add_url_rule" && viewClassName && methodViewMethods.has(viewClassName)) {
      const viewMethods = methodViewMethods.get(viewClassName)
      if (viewMethods?.length) { methods.length = 0; methods.push(...viewMethods) }
    }
    const prefix = blueprintPrefix.get(decoratorTarget.split(".")[0])
    if (prefix) routePath = normalizePath(`${prefix}${routePath.startsWith("/") ? "" : "/"}${routePath}`)
    const head = content.slice(Math.max(0, (m.index ?? 0) - 200), (m.index ?? 0))
    const hasAuthDec = /@login_required|@jwt_required|@token_required|@requires_auth|@permission_required|@fresh_jwt_required/.test(head)
    for (const method of methods) {
      const r = makeRoute(method, routePath, "")
      if (hasAuthDec || /@login_required|@jwt_required|@token_required|@requires_auth/.test(m[0])) {
        r.authRequired = true; r.authType = "middleware"; r.reasonings?.push("Décorateur d'auth Flask détecté")
      }
      detectAuthByStatusSignal(content, r); routes.push(r)
    }
  }
  const ADD_URL_RULE_RE = /([A-Za-z_][\w.]*)\.add_url_rule\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of content.matchAll(ADD_URL_RULE_RE)) {
    const decoratorTarget = m[1]; let routePath = m[2]; const args = m[3] || ""
    const methods: string[] = (() => { const result = parseMethodList(args); return result.length ? result : ["GET"] })()
    const viewClassName = args.match(/([A-Za-z_][\w]*)\.as_view\(/)?.[1]
    if (viewClassName && methodViewMethods.has(viewClassName)) {
      const viewMethods = methodViewMethods.get(viewClassName)
      if (viewMethods?.length) { methods.length = 0; methods.push(...viewMethods) }
    }
    const prefix = blueprintPrefix.get(decoratorTarget.split(".")[0])
    if (prefix) routePath = normalizePath(`${prefix}${routePath.startsWith("/") ? "" : "/"}${routePath}`)
    for (const method of methods) { const r = makeRoute(method, routePath, ""); detectAuthByStatusSignal(content, r); routes.push(r) }
  }
  const ADD_RESOURCE_RE = /([A-Za-z_][\w.]*)\.add_resource\s*\(\s*([A-Za-z_][\w.]*)\s*,\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of content.matchAll(ADD_RESOURCE_RE)) {
    const resourceClass = m[2]; const routePath = m[3]
    const methods = methodViewMethods.get(resourceClass) ?? ["GET", "POST", "PUT", "DELETE", "PATCH"]
    for (const method of methods) { const r = makeRoute(method, routePath, ""); detectAuthByStatusSignal(content, r); routes.push(r) }
  }
  if (routes.length === 0) {
    const SIMPLE = /@app\.route\s*\(\s*['"]([^'"]+)['"]/g
    for (const m of content.matchAll(SIMPLE)) { routes.push(makeRoute("GET", m[1], "")) }
  }
  return routes
}

export function detectDjango(content: string): DetectedRoute[] {
  const astRoutes = detectPythonRoutesAST(content, "django")
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const PATH_RE = /(?:re_)?path\s*\(\s*['"]([^'"]+)['"],\s*([A-Za-z_][\w.]*)/g
  for (const m of content.matchAll(PATH_RE)) {
    const r = makeRoute("GET", m[1].replace(/\(\?P<[^>]+>[^)]+\)/g, ":param"), ""); r.controller = m[2]
    const viewDef = content.match(new RegExp(`${escapeRegExpStr(m[2])}[\\s\\S]{0,200}?@(?:login_required|permission_required)`))
    if (viewDef) { r.authRequired = true; r.authType = "middleware"; r.reasonings?.push("Django @login_required / @permission_required") }
    routes.push(r)
  }
  const ROUTER_RE = /router\.register\s*\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z_][\w]*)/g
  for (const m of content.matchAll(ROUTER_RE)) {
    for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH"]) { routes.push(makeRoute(method, `/${m[1]}`, "")) }
  }
  return routes
}

export function detectTornado(content: string): DetectedRoute[] {
  const astRoutes = detectPythonRoutesAST(content, "tornado")
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const handlerMethods = new Map<string, string[]>()
  const HANDLER_RE = /class\s+([A-Za-z_][\w]*)\s*\([^\n]*RequestHandler[^\)]*\):([\s\S]*?)(?=\nclass\s|\n\n|$)/g
  for (const m of sanitized.matchAll(HANDLER_RE)) {
    const className = m[1]; const body = m[2]
    const methods = Array.from(body.matchAll(/def\s+(get|post|put|delete|patch)\s*\(/g)).map((x) => x[1].toUpperCase())
    if (methods.length) handlerMethods.set(className, methods)
  }
  const ROUTE_LIST_RE = /Application\s*\(\s*\[([\s\S]*?)\]/g
  for (const m of sanitized.matchAll(ROUTE_LIST_RE)) {
    const listBody = m[1]
    for (const entry of listBody.matchAll(/\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z_][\w.]*)/g)) {
      const pathValue = entry[1]; const handler = entry[2].split(".").pop() || entry[2]
      const methods = handlerMethods.get(handler) ?? ["GET"]
      for (const method of methods) { const r = makeRoute(method, normalizePath(pathValue), ""); detectAuthByStatusSignal(content, r); routes.push(r) }
    }
  }
  return routes
}

export function detectSanic(content: string): DetectedRoute[] {
  const astRoutes = detectPythonRoutesAST(content, "sanic")
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const blueprintPrefix = new Map<string, string>()
  const BLUEPRINT_DEF_RE = /([A-Za-z_][\w]*)\s*=\s*Blueprint\s*\(\s*['"][^'\"\s]+['\"]\s*,[\s\S]*?url_prefix\s*=\s*['"]([^'\"]+)['"]/g
  for (const m of sanitized.matchAll(BLUEPRINT_DEF_RE)) { blueprintPrefix.set(m[1], m[2]) }
  const ROUTE_RE = /@([A-Za-z_][\w.]*)\.(get|post|put|delete|patch|options|head|route)\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(ROUTE_RE)) {
    const target = m[1]; const methodName = m[2]; let routePath = m[3]; const args = m[4] || ""
    const methods = methodName === "route" ? (() => { const result = parseMethodList(args); return result.length ? result : ["GET"] })() : [methodName.toUpperCase()]
    const prefix = blueprintPrefix.get(target.split(".")[0])
    if (prefix) routePath = normalizePath(`${prefix}${routePath.startsWith("/") ? "" : "/"}${routePath}`)
    for (const method of methods) { const r = makeRoute(method, normalizePath(routePath), ""); detectAuthByStatusSignal(content, r); routes.push(r) }
  }
  const ADD_ROUTE_RE = /([A-Za-z_][\w.]*)\.add_route\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(ADD_ROUTE_RE)) {
    let method = m[2].toUpperCase(); const routePath = m[3]; const args = m[4] || ""
    if (method === "ROUTE") { const explicit = args.match(/['\"](GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)['\"]/i)?.[1]; if (explicit) method = explicit.toUpperCase() }
    const r = makeRoute(method, normalizePath(routePath), ""); detectAuthByStatusSignal(content, r); routes.push(r)
  }
  return routes
}

export function detectStarlette(content: string): DetectedRoute[] {
  const astRoutes = detectPythonRoutesAST(content, "starlette")
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const ROUTE_RE = /Route\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(ROUTE_RE)) {
    const routePath = m[1]; const args = m[2] || ""
    const methods = (() => { const result = parseMethodList(args); return result.length ? result : ["GET"] })()
    for (const method of methods) { const r = makeRoute(method, normalizePath(routePath), ""); detectAuthByStatusSignal(content, r); routes.push(r) }
  }
  return routes
}

export function detectLitestar(content: string): DetectedRoute[] {
  const astRoutes = detectPythonRoutesAST(content, "litestar")
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const ROUTE_RE = /@(?:get|post|put|delete|patch|options|head|route)\s*\(\s*['\"]([^'"]+)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(ROUTE_RE)) {
    const routePath = m[1]; const argText = m[2] || ""
    const methods = (() => { const result = parseMethodList(argText); return result.length ? result : ["GET"] })()
    for (const method of methods) { const r = makeRoute(method, normalizePath(routePath), ""); detectAuthByStatusSignal(content, r); routes.push(r) }
  }
  return routes
}

export function detectAiohttp(content: string): DetectedRoute[] {
  const astRoutes = detectPythonRoutesAST(content, "aiohttp")
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const DECORATOR_RE = /@([A-Za-z_][\w.]*)\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'"]+)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(DECORATOR_RE)) {
    const method = m[2].toUpperCase(); const routePath = m[3]
    const r = makeRoute(method, normalizePath(routePath), ""); detectAuthByStatusSignal(content, r); routes.push(r)
  }
  const ADD_ROUTE_RE = /([A-Za-z_][\w.]*)\.router\.add_(get|post|put|delete|patch|route)\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(ADD_ROUTE_RE)) {
    let method = m[2].toUpperCase(); const routePath = m[3]; const args = m[4] || ""
    if (method === "ROUTE") { const explicit = args.match(/['\"](GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)['\"]/i)?.[1]; if (explicit) method = explicit.toUpperCase() }
    const r = makeRoute(method, normalizePath(routePath), ""); detectAuthByStatusSignal(content, r); routes.push(r)
  }
  return routes
}

export function detectFalcon(content: string): DetectedRoute[] {
  const astRoutes = detectPythonRoutesAST(content, "falcon")
  if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const resourceMethods = new Map<string, string[]>()
  const RESOURCE_RE = /class\s+([A-Za-z_][\w]*)\s*\([^\n]*\):([\s\S]*?)(?=\nclass\s|\n\n|$)/g
  for (const m of sanitized.matchAll(RESOURCE_RE)) {
    const className = m[1]; const body = m[2]
    const methods = Array.from(body.matchAll(/def\s+on_(get|post|put|delete|patch)\s*\(/g)).map((x) => x[1].toUpperCase())
    if (methods.length) resourceMethods.set(className, methods)
  }
  const ADD_ROUTE_RE = /([A-Za-z_][\w.]*)\.add_route\s*\(\s*['\"]([^'"\s][^'\"]*)['\"]\s*,\s*([A-Za-z_][\w.]*)/g
  for (const m of sanitized.matchAll(ADD_ROUTE_RE)) {
    const routePath = m[2]; const resourceName = m[3].split(".").pop() || m[3]
    const methods = resourceMethods.get(resourceName) ?? ["GET"]
    for (const method of methods) { const r = makeRoute(method, normalizePath(routePath), ""); detectAuthByStatusSignal(content, r); routes.push(r) }
  }
  return routes
}

function getDecoratorName(node: ts.Node): string | null {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  return null
}

function parseNestJSDecoratorPath(decorator: ts.Decorator): string | null {
  const expression = decorator.expression
  if (!ts.isCallExpression(expression)) return null
  const arg = expression.arguments[0]
  if (!arg) return ""

  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text
  if (ts.isObjectLiteralExpression(arg)) {
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const key = ts.isIdentifier(prop.name) ? prop.name.text : ts.isStringLiteral(prop.name) ? prop.name.text : null
      if (key !== "path") continue
      const value = prop.initializer
      if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text
    }
  }

  return ""
}

function parseNestJSMethodDecorator(decorator: ts.Decorator): { method: string; path: string } | null {
  const expression = decorator.expression
  if (!ts.isCallExpression(expression)) return null
  const name = getDecoratorName(expression.expression)
  if (!name) return null
  const method = name.toUpperCase()
  if (!HTTP_METHODS_UPPER_ALL.has(method)) return null
  const path = parseNestJSDecoratorPath(decorator) ?? ""
  return { method: method === "ALL" ? "GET" : method, path }
}

function hasNestJSAuthDecorator(decorators: readonly ts.Decorator[] | undefined): boolean {
  if (!decorators) return false
  return decorators.some((decorator) => {
    const expression = decorator.expression
    if (!ts.isCallExpression(expression)) return false
    const name = getDecoratorName(expression.expression)
    return name === "UseGuards" || name === "Roles" || name === "UseInterceptors"
  })
}

function detectNestJSAST(content: string): DetectedRoute[] {
  const sourceFile = ts.createSourceFile("detect.ts", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const classDecorators = (node as any).decorators || []
      const controllerPrefix = classDecorators?.flatMap((decorator: ts.Decorator) => {
        const expression = decorator.expression
        const name = ts.isCallExpression(expression) ? getDecoratorName(expression.expression) : getDecoratorName(expression)
        if (name !== "Controller") return []
        const path = parseNestJSDecoratorPath(decorator)
        return path === null ? [] : [path ?? ""]
      })[0] ?? ""

      const classAuth = hasNestJSAuthDecorator(classDecorators)

      for (const member of node.members) {
        const methodDecorators = (member as any).decorators || []
        if (!ts.isMethodDeclaration(member) || !methodDecorators.length) continue
        for (const decorator of methodDecorators) {
          const parsed = parseNestJSMethodDecorator(decorator)
          if (!parsed) continue
          const route = makeRoute(parsed.method as HttpMethod, normalizePath(`${controllerPrefix}/${parsed.path}`) || "/", "")
          route.authRequired = classAuth || hasNestJSAuthDecorator(methodDecorators)
          if (route.authRequired) {
            route.authType = "middleware"
            route.reasonings?.push("NestJS @UseGuards / @Roles / @UseInterceptors")
          }
          const key = `${route.method}|${route.path}`
          if (!seen.has(key)) {
            seen.add(key)
            routes.push(route)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return routes
}

export function detectNestJS(content: string): DetectedRoute[] {
  const astRoutes = detectNestJSAST(content)
  if (astRoutes.length > 0) return astRoutes

  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  const CLASS_RE = /@Controller\s*\(\s*(?:['"`]([^'"`]*)['"`]|\{[^}]*path\s*:\s*['"`]([^'"`]*)['"`][^}]*\})?\s*\)\s*(?:export\s+)?class\s+[A-Za-z_]\w*\s*\{([\s\S]*?)(?=(?:^\s*@Controller|\Z))/gmi
  for (const m of content.matchAll(CLASS_RE)) {
    const classPrefix = m[1] || m[2] || ""
    const classBody = m[3]
    const METHOD_RE = /@(Get|Post|Put|Delete|Patch|Options|Head|All)\s*\(\s*(?:['"`]([^'"`]*)['"`]|\{[^}]*path\s*:\s*['"`]([^'"`]*)['"`][^}]*\})?\s*\)/g
    for (const mm of classBody.matchAll(METHOD_RE)) {
      const method = mm[1].toUpperCase() === "ALL" ? "GET" : mm[1].toUpperCase()
      const subPath = mm[2] ?? mm[3] ?? ""
      const path = normalizePath(`${classPrefix}/${subPath}`)
      const r = makeRoute(method, path || "/", "")
      const idx = mm.index ?? 0
      const preceding = classBody.slice(Math.max(0, idx - 300), idx)
      if (/@UseGuards\s*\(|@Roles\s*\(|@UseInterceptors\s*\(/.test(preceding)) {
        r.authRequired = true; r.authType = "middleware"; r.reasonings?.push("NestJS @UseGuards / @Roles / @UseInterceptors")
      }
      const key = `${r.method}|${r.path}`
      if (!seen.has(key)) { seen.add(key); routes.push(r) }
    }
  }

  if (routes.length === 0) {
    const METHOD_RE = /@(Get|Post|Put|Delete|Patch|Options|Head|All)\s*\(\s*(?:['"`]([^'"`]*)['"`]|\{[^}]*path\s*:\s*['"`]([^'"`]*)['"`][^}]*\})?\s*\)/g
    for (const m of content.matchAll(METHOD_RE)) {
      const method = m[1].toUpperCase() === "ALL" ? "GET" : m[1].toUpperCase()
      const subPath = m[2] ?? m[3] ?? ""
      const r = makeRoute(method, subPath || "/", "")
      const idx = m.index ?? 0
      const preceding = content.slice(Math.max(0, idx - 300), idx)
      if (/@UseGuards\s*\(|@Roles\s*\(|@UseInterceptors\s*\(/.test(preceding)) {
        r.authRequired = true; r.authType = "middleware"; r.reasonings?.push("NestJS @UseGuards / @Roles / @UseInterceptors")
      }
      const key = `${r.method}|${r.path}`
      if (!seen.has(key)) { seen.add(key); routes.push(r) }
    }
  }

  return routes
}

export function detectLaravel(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []

  const parseMethodList = (text: string): string[] => {
    const list = text.match(/\[\s*(['"][^'"]+['"](?:\s*,\s*['"][^'"]+['"])*?)\s*\]/)
    if (!list) return []
    return list[1].split(/\s*,\s*/).map((item) => item.replace(/['"\s]/g, "").toUpperCase())
  }

  const parseGroupChain = (chain: string) => {
    const result = { prefix: "", auth: false }
    for (const m of chain.matchAll(/(prefix|middleware)\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (m[1] === "prefix") result.prefix = normalizePath(`${result.prefix}${m[2]}`)
      if (m[1] === "middleware" && /auth/.test(m[2])) result.auth = true
    }
    return result
  }

  const addLaravelRoute = (method: string, path: string, auth = false, reason = "") => {
    const r = makeRoute(method, normalizePath(path), "")
    if (auth) { r.authRequired = true; r.authType = "middleware"; if (reason) r.reasonings?.push(reason) }
    routes.push(r)
  }

  const ROUTE_RE = /Route::(get|post|put|delete|patch|any|match)\s*\(([^;]*?)\)\s*;/g
  for (const m of content.matchAll(ROUTE_RE)) {
    const verb = m[1]
    const args = m[2]
    if (verb === "match") {
      const methods = parseMethodList(args)
      const pathMatch = args.match(/['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/)
      if (!pathMatch) continue
      const path = pathMatch[2]
      const auth = /->middleware\s*\(\s*\[?['"][^'"]*auth/.test(args)
      for (const method of methods.length ? methods : ["GET"]) { addLaravelRoute(method, path, auth, "Laravel Route::match(...)") }
      continue
    }

    const pathMatch = args.match(/['"]([^'"]+)['"]/)
    if (!pathMatch) continue
    const path = pathMatch[1]
    const method = verb === "any" ? "GET" : verb.toUpperCase()
    const auth = /->middleware\s*\(\s*\[?['"][^'"]*auth/.test(args)
    addLaravelRoute(method, path, auth, "Laravel ->middleware('auth')")
  }

  const RESOURCE_RE = /Route::(apiResource|resource)\s*\(\s*['"]([^'"]+)['"]\s*,/g
  for (const m of content.matchAll(RESOURCE_RE)) {
    const base = normalizePath(m[2])
    const methods = ["GET", "POST", "GET", "PUT", "PATCH", "DELETE"]
    const paths = [base, base, `${base}/:id`, `${base}/:id`, `${base}/:id`, `${base}/:id`]
    for (let i = 0; i < methods.length; i++) { addLaravelRoute(methods[i], paths[i], false, `Laravel ${m[1]} route`) }
  }

  const GROUP_RE = /Route::((?:\s*(?:prefix|middleware)\s*\(\s*['"]([^'"]+)['"]\s*\)\s*->\s*)*)group\s*\(\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\}\s*\)/g
  for (const m of content.matchAll(GROUP_RE)) {
    const chain = m[1]
    const groupBody = m[2]
    const { prefix, auth } = parseGroupChain(chain)
    const INNER = /Route::(get|post|put|delete|patch|any|match)\s*\(([^;]*?)\)\s*;/g
    for (const inner of groupBody.matchAll(INNER)) {
      const innerVerb = inner[1]
      const innerArgs = inner[2]
      if (innerVerb === "match") {
        const methods = parseMethodList(innerArgs)
        const pathMatch = innerArgs.match(/['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/)
        if (!pathMatch) continue
        const path = normalizePath(`${prefix}${pathMatch[2]}`)
        for (const method of methods.length ? methods : ["GET"]) { addLaravelRoute(method, path, auth, "Laravel grouped route") }
        continue
      }
      const pathMatch = innerArgs.match(/['"]([^'"]+)['"]/)
      if (!pathMatch) continue
      const method = innerVerb === "any" ? "GET" : innerVerb.toUpperCase()
      const path = normalizePath(`${prefix}${pathMatch[1]}`)
      addLaravelRoute(method, path, auth, "Laravel grouped route")
    }
  }

  return routes
}

export function detectRails(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const VERB_RE = /\b(get|post|put|patch|delete|resources?|namespace)\s+['"]([^'"]+)['"]([\s\S]{0,200}?)(?=\n\s*(?:get|post|put|patch|delete|resources?|end|namespace)|$)/g
  for (const m of content.matchAll(VERB_RE)) {
    const verb = m[1]; const routePath = m[2]; const opts = m[3] || ""
    if (verb === "resources" || verb === "resource") { for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) routes.push(makeRoute(method, `/${routePath}`, "")) }
    else if (verb === "namespace") { routes.push(makeRoute("GET", `/${routePath}`, "")) }
    else {
      const r = makeRoute(verb.toUpperCase(), routePath, "")
      if (/authenticate_user!|before_action\s*:authenticate/.test(opts)) { r.authRequired = true; r.authType = "middleware"; r.reasonings?.push("Rails authenticate_user! / before_action :authenticate") }
      routes.push(r)
    }
  }
  return routes
}

export function detectPhoenix(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const VERB_RE = /\b(get|post|put|patch|delete)\s*\(\s*['"]([^'"\s][^'"]*)['"]\s*,\s*([A-Za-z0-9_.]+)\s*,\s*:?([A-Za-z0-9_]+)?/gi
  for (const m of content.matchAll(VERB_RE)) {
    const method = m[1].toUpperCase(); const pathStr = m[2]; const controller = m[3]; const action = m[4] || "index"
    const r = makeRoute(method, pathStr, `${controller}#${action}`); r.controller = controller
    const ctx = content.slice(Math.max(0, (m.index ?? 0) - 200), (m.index ?? 0) + 200)
    if (/pipeline\s*:\s*browser|pipeline\s*:\s*api|pipe_through\s*:\s*\[:?\w+/.test(ctx) && /auth|authenticate|ensure_auth|:browser/.test(ctx)) {
      r.authRequired = true; r.authType = "middleware"; r.reasonings?.push("Pipeline/pipe_through suggerant protection")
    }
    routes.push(r)
  }
  const RES_RE = /\bresources\s*\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_.]+)/gi
  for (const m of content.matchAll(RES_RE)) {
    const base = m[1]; const controller = m[2]
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const r = makeRoute(method, `/${base}`, `${controller}#resource`); r.controller = controller; routes.push(r)
    }
  }
  return routes
}

export function detectServant(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const PATH_RE = /"([^"\\]+)"\s*:\s*>/g; const seen = new Set<string>()
  for (const m of content.matchAll(PATH_RE)) {
    const seg = m[1]; const path = `/${seg}`
    if (!seen.has(path)) { seen.add(path); routes.push(makeRoute("GET", path, "Servant inferred route")) }
  }
  const LIT_RE = /\"([\/][^\"]+)\"/g
  for (const m of content.matchAll(LIT_RE)) {
    const p = m[1]; if (p.includes("/") && !seen.has(p)) { seen.add(p); routes.push(makeRoute("GET", p, "Servant/WAI inferred route")) }
  }
  return routes
}

let _javaParser: any = null
async function getJavaParser() {
  if (!_javaParser) { try { _javaParser = await import("java-parser") } catch { return null } }
  return _javaParser
}

async function parseJavaSource(source: string): Promise<any | null> {
  if (!source || !source.trim()) return null
  try {
    const parser = await getJavaParser()
    return parser?.parse ? parser.parse(source) : null
  } catch { return null }
}

function findJavaNodes(node: any, name: string): any[] {
  if (!node || typeof node !== "object") return []
  const results: any[] = []
  if (node.name === name) results.push(node)
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (Array.isArray(value)) { for (const child of value) results.push(...findJavaNodes(child, name)) }
    else if (value && typeof value === "object") results.push(...findJavaNodes(value, name))
  }
  return results
}

function collectJavaIdentifiers(node: any): string[] {
  if (!node || typeof node !== "object") return []
  if (node.name === "Identifier" && typeof node.image === "string") return [node.image]
  let identifiers: string[] = []
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (Array.isArray(value)) { for (const child of value) identifiers = identifiers.concat(collectJavaIdentifiers(child)) }
    else if (value && typeof value === "object") identifiers = identifiers.concat(collectJavaIdentifiers(value))
  }
  return identifiers
}

function findFirstStringLiteral(node: any): string | undefined {
  if (!node || typeof node !== "object") return undefined
  if (node.name === "StringLiteral" && typeof node.image === "string") return node.image.replace(/^"|"$/g, "")
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (Array.isArray(value)) { for (const child of value) { const found = findFirstStringLiteral(child); if (found) return found } }
    else if (value && typeof value === "object") { const found = findFirstStringLiteral(value); if (found) return found }
  }
  return undefined
}

function findLastIdentifier(node: any): string | undefined {
  const ids = collectJavaIdentifiers(node); return ids.length ? ids[ids.length - 1] : undefined
}

function getJavaAnnotationName(annotation: any): string {
  const typeName = annotation?.children?.typeName?.[0]; return collectJavaIdentifiers(typeName).join(".")
}

function getJavaAnnotationPairs(annotation: any): Record<string, string> {
  const result: Record<string, string> = {}
  const pairs = annotation?.children?.elementValuePairList?.[0]?.children?.elementValuePair
  if (!Array.isArray(pairs)) return result
  for (const pair of pairs) {
    const key = pair?.children?.Identifier?.[0]?.image; const valueNode = pair?.children?.elementValue?.[0]
    if (!key || !valueNode) continue; result[key] = findFirstStringLiteral(valueNode) ?? findLastIdentifier(valueNode) ?? ""
  }
  return result
}

function getJavaAnnotationValue(annotation: any): string | undefined {
  const directValue = findFirstStringLiteral(annotation?.children?.elementValue?.[0])
  if (directValue) return directValue; const pairs = getJavaAnnotationPairs(annotation); return pairs.value || pairs.path || pairs.name
}

function getJavaAnnotationMethod(annotation: any): string | undefined {
  const rawName = getJavaAnnotationName(annotation); const name = rawName.split(".").pop()?.toUpperCase() ?? ""
  if (HTTP_METHODS_UPPER_ALL.has(name)) return name
  if (name === "REQUESTMAPPING") {
    const pairs = getJavaAnnotationPairs(annotation); const method = pairs.method
    if (typeof method === "string" && method.length > 0) return method.split(".").pop()?.toUpperCase() ?? "GET"
    return "GET"
  }
  if (name.endsWith("MAPPING")) return name.replace(/MAPPING$/, "") || "GET"
  return undefined
}

function getJavaAnnotationPath(annotation: any): string | undefined {
  const value = getJavaAnnotationValue(annotation); return value ? normalizePath(value) : undefined
}

function matchJavaClassPrefix(classNode: any, validNames: string[]): string {
  const annotations = findJavaNodes(classNode, "annotation")
  for (const annotation of annotations) {
    const annotationName = getJavaAnnotationName(annotation).split(".").pop() ?? ""
    if (validNames.includes(annotationName)) return getJavaAnnotationPath(annotation) ?? ""
  }
  return ""
}

async function detectSpringAST(content: string): Promise<DetectedRoute[]> {
  const ast = await parseJavaSource(content); if (!ast) return []
  const routes: DetectedRoute[] = []; const seen = new Set<string>()
  const classDeclarations = findJavaNodes(ast, "classDeclaration")
  for (const classNode of classDeclarations) {
    const classPrefix = matchJavaClassPrefix(classNode, ["RequestMapping", "GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping"])
    const methodDeclarations = findJavaNodes(classNode, "methodDeclaration")
    for (const methodDecl of methodDeclarations) {
      const annotations = findJavaNodes(methodDecl, "annotation")
      for (const annotation of annotations) {
        const method = getJavaAnnotationMethod(annotation); if (!method) continue
        const subPath = getJavaAnnotationPath(annotation) ?? ""
        const path = normalizePath(`${classPrefix}/${subPath}`); const key = `${method}|${path}`
        if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, path, "")) }
      }
    }
  }
  return routes
}

async function detectMicronautAST(content: string): Promise<DetectedRoute[]> {
  const ast = await parseJavaSource(content); if (!ast) return []
  const routes: DetectedRoute[] = []; const seen = new Set<string>()
  const classDeclarations = findJavaNodes(ast, "classDeclaration")
  for (const classNode of classDeclarations) {
    const classPrefix = matchJavaClassPrefix(classNode, ["Controller"])
    const methodDeclarations = findJavaNodes(classNode, "methodDeclaration")
    for (const methodDecl of methodDeclarations) {
      const annotations = findJavaNodes(methodDecl, "annotation")
      for (const annotation of annotations) {
        const method = getJavaAnnotationMethod(annotation); if (!method) continue
        const subPath = getJavaAnnotationPath(annotation) ?? ""
        const path = normalizePath(`${classPrefix}/${subPath}`); const key = `${method}|${path}`
        if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, path, "")) }
      }
    }
  }
  return routes
}

async function detectQuarkusAST(content: string): Promise<DetectedRoute[]> {
  const ast = await parseJavaSource(content); if (!ast) return []
  const routes: DetectedRoute[] = []; const seen = new Set<string>()
  const classDeclarations = findJavaNodes(ast, "classDeclaration")
  for (const classNode of classDeclarations) {
    const classPrefix = matchJavaClassPrefix(classNode, ["Path"])
    const methodDeclarations = findJavaNodes(classNode, "methodDeclaration")
    for (const methodDecl of methodDeclarations) {
      const annotations = findJavaNodes(methodDecl, "annotation")
      const pathAnnotation = annotations.find((a: any) => (getJavaAnnotationName(a).split(".").pop() ?? "") === "Path")
      const verbAnnotation = annotations.find((a: any) => {
        const name = (getJavaAnnotationName(a).split(".").pop() ?? "").toUpperCase()
        return HTTP_METHODS_UPPER.has(name)
      })
      if (!verbAnnotation) continue; const method = getJavaAnnotationMethod(verbAnnotation); if (!method) continue
      const subPath = pathAnnotation ? getJavaAnnotationPath(pathAnnotation) ?? "" : ""
      const path = normalizePath(`${classPrefix}/${subPath}`); const key = `${method}|${path}`
      if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, path, "")) }
    }
  }
  return routes
}

function extractJavaAnnotationPath(source: string): string {
  return source.match(/(?:value|path)\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? source.match(/\(\s*['"]([^'"]+)['"]\s*\)/)?.[1] ?? ""
}

function extractJavaRequestMethod(source: string): string | undefined {
  return source.match(/RequestMethod\.([A-Za-z]+)/)?.[1]
}

export async function detectSpring(content: string): Promise<DetectedRoute[]> {
  const astRoutes = await detectSpringAST(content); if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const classPrefix = extractJavaAnnotationPath(content.match(/@RequestMapping\s*\(([^)]*)\)/)?.[1] ?? "")
  const MAP_RE = /@(Get|Post|Put|Delete|Patch|Request)Mapping\s*\(([^)]*)\)/g; const seen = new Set<string>()
  for (const m of content.matchAll(MAP_RE)) {
    const verb = m[1] === "Request" ? (extractJavaRequestMethod(m[2]) || "GET") : m[1].toUpperCase()
    const subPath = extractJavaAnnotationPath(m[2]); const path = normalizePath(`${classPrefix}/${subPath}`)
    const r = makeRoute(verb, path, ""); const idx = m.index ?? 0; const preceding = content.slice(Math.max(0, idx - 400), idx)
    if (/@PreAuthorize|@Secured|@RolesAllowed|@WithMockUser/.test(preceding)) { r.authRequired = true; r.authType = "middleware"; r.reasonings?.push("Spring @PreAuthorize / @Secured / @RolesAllowed") }
    const key = `${verb}|${path}`; if (!seen.has(key)) { seen.add(key); routes.push(r) }
  }
  return routes
}

export async function detectMicronaut(content: string): Promise<DetectedRoute[]> {
  const astRoutes = await detectMicronautAST(content); if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []
  const classPrefix = content.match(/@Controller\s*\(\s*(?:value\s*=\s*)?['"]([^'"]+)['"]\s*\)/)?.[1] ?? ""
  const METHOD_RE = /@(Get|Post|Put|Delete|Patch)\s*\(\s*(?:value\s*=\s*)?['"]([^'"]*)['"]\s*\)/g
  for (const m of content.matchAll(METHOD_RE)) {
    const verb = m[1].toUpperCase(); const subPath = m[2] || ""
    routes.push(makeRoute(verb, normalizePath(`${classPrefix}/${subPath}`), ""))
  }
  return routes
}

export async function detectQuarkus(content: string): Promise<DetectedRoute[]> {
  const astRoutes = await detectQuarkusAST(content); if (astRoutes.length > 0) return astRoutes
  const routes: DetectedRoute[] = []; const seen = new Set<string>()
  const classPrefix = content.match(/@Path\s*\(\s*['"]([^'"]+)['"]\s*\)/)?.[1] ?? ""
  const METHOD_BLOCK_RE = /((?:@\w+(?:\s*\([^)]*\))?\s*)+)(?=\s*(?:public|private|protected|fun)\s)/g
  for (const blockMatch of content.matchAll(METHOD_BLOCK_RE)) {
    const block = blockMatch[1]; const verbMatch = block.match(/@(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/); if (!verbMatch) continue
    const method = verbMatch[1] === "OPTIONS" ? "GET" : verbMatch[1]; const subPath = extractJavaAnnotationPath(block)
    const path = normalizePath(`${classPrefix}/${subPath}`); const key = `${method}|${path}`
    if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, path, "")) }
  }
  return routes
}

export function detectAspNet(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const MAP_RE = /(?:app|endpoints)\.(MapGet|MapPost|MapPut|MapDelete|MapPatch)\s*\(\s*['"]([^'"]+)['"]/g
  for (const m of content.matchAll(MAP_RE)) {
    const method = m[1].replace("Map", "").toUpperCase(); const r = makeRoute(method, m[2], ""); routes.push(r)
  }
  const ATTR_RE = /\[(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch)\s*(?:\(\s*['"]([^'"]+)['"]\s*\))?\]/g
  for (const m of content.matchAll(ATTR_RE)) {
    const method = m[1].replace("Http", "").toUpperCase(); const subPath = m[2] ?? ""
    const idx = m.index ?? 0; const preceding = content.slice(Math.max(0, idx - 300), idx)
    const r = makeRoute(method, subPath || "/", "")
    if (/\[Authorize/.test(preceding)) { r.authRequired = true; r.authType = "middleware"; r.reasonings?.push("ASP.NET [Authorize]") }
    routes.push(r)
  }
  return routes
}

export function detectGo(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  const routerVars = new Set<string>()
  const groupPrefix = new Map<string, string>()

  // Detect router/engine variable names
  for (const m of content.matchAll(/(?:const|var|\w+\s*:=\s*)?\s*(\w+)\s*[=:]\s*(?:gin\.(?:Default|New)|echo\.New|fiber\.New|chi\.NewRouter|mux\.NewRouter|http\.NewServeMux)\s*\(/g)) { routerVars.add(m[1]) }
  for (const m of content.matchAll(/(?:const|var|\w+\s*:=\s*)?\s*(\w+)\s*[=:]\s*(?:gin|echo|fiber|chi|mux)\.(?:Default|New|NewRouter)\s*\(/g)) { routerVars.add(m[1]) }
  for (const m of content.matchAll(/(?:const|var|\w+\s*:=\s*)?\s*(\w+)\s*[=:]\s*(?:\w+)\.(?:Group|Route|GroupFunc)\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    routerVars.add(m[1]); groupPrefix.set(m[1], m[2])
  }
  // Fallback common names
  for (const name of ["r", "router", "engine", "mux", "e", "echo", "g", "group", "app", "api"]) { routerVars.add(name) }

  const isRouter = (obj: string) => routerVars.has(obj)

  const prefixFor = (obj: string) => groupPrefix.get(obj) ?? ""

  // Standard http.HandleFunc / http.Handle
  const STD_RE = /([A-Za-z_]\w*)\s*\.\s*(HandleFunc|Handle)\s*\(\s*['"`]([^'"`\s]+)['"`]/g
  for (const m of content.matchAll(STD_RE)) {
    if (isRouter(m[1])) routes.push(makeRoute("GET", m[3], ""))
  }

  // Gin
  const GIN_RE = /([A-Za-z_]\w*)\s*\.\s*(GET|POST|PUT|DELETE|PATCH|Any|HEAD|OPTIONS)\s*\(\s*['"`]([^'"`\s]+)['"`]/g
  for (const m of content.matchAll(GIN_RE)) {
    if (isRouter(m[1])) {
      const method = m[2] === "Any" ? "GET" : m[2]
      addRoute(routes, seen, method, normalizePath(`${prefixFor(m[1])}/${m[3]}`))
    }
  }

  // Echo
  const ECHO_RE = /([A-Za-z_]\w*)\s*\.\s*(GET|POST|PUT|DELETE|PATCH|Any|HEAD|OPTIONS)\s*\(\s*['"`]([^'"`\s]+)['"`]/g
  for (const m of content.matchAll(ECHO_RE)) {
    if (isRouter(m[1])) {
      const method = m[2] === "Any" ? "GET" : m[2]
      addRoute(routes, seen, method, normalizePath(`${prefixFor(m[1])}/${m[3]}`))
    }
  }

  // Fiber
  const FIBER_RE = /([A-Za-z_]\w*)\s*\.\s*(Get|Post|Put|Delete|Patch|All|Head|Options)\s*\(\s*['"`]([^'"`\s]+)['"`]/g
  for (const m of content.matchAll(FIBER_RE)) {
    if (isRouter(m[1])) {
      const method = m[2] === "All" ? "GET" : m[2].toUpperCase()
      addRoute(routes, seen, method, normalizePath(`${prefixFor(m[1])}/${m[3]}`))
    }
  }

  // Chi
  const CHI_RE = /([A-Za-z_]\w*)\s*\.\s*(Get|Post|Put|Delete|Patch|Head|Options|Route)\s*\(\s*['"`]([^'"`\s]+)['"`]/g
  for (const m of content.matchAll(CHI_RE)) {
    if (isRouter(m[1])) {
      const method = m[2] === "Route" ? "GET" : m[2].toUpperCase()
      addRoute(routes, seen, method, normalizePath(`${prefixFor(m[1])}/${m[3]}`))
    }
  }

  return routes
}

function addRoute(routes: DetectedRoute[], seen: Set<string>, method: string, path: string): void {
  const key = `${method}|${normalizePath(path)}`
  if (!seen.has(key)) { seen.add(key); routes.push(makeRoute(method, path, "")) }
}

// ── Next.js routers ─────────────────────────────────────────────────────────

export function detectNextjsAppRouter(f: { path: string; content: string }): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const normalizedPath = f.path.replace(/\\/g, "/")
  if (!/\/app\/api\//.test(normalizedPath)) return routes
  if (!/route\.(ts|js|tsx|jsx)$/.test(normalizedPath)) return routes
  const rel = normalizedPath.split("/app/api/")[1]
  let urlPath = "/" + rel
    .replace(/\/route\.(ts|js|tsx|jsx)$/, "")
    .replace(/index$/, "")
    .replace(/\[\.\.\.([^\]]+)\]/g, ":$1*")
    .replace(/\[([^\]]+)\]/g, ":$1")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
  if (urlPath === "") urlPath = "/"
  urlPath = `/api${urlPath}`
  const EXPORT_METHOD_RE = /export\s+(?:async\s+)?(?:function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b([\s\S]{0,2000}?)(?=\nexport|\nconst|\nfunction|$)/g
  for (const m of f.content.matchAll(EXPORT_METHOD_RE)) {
    const method = m[1]; const body = m[2] || ""; const r = makeRoute(method, urlPath, ""); r.sourceFile = f.path
    analyzeHandlerBody(body, r); routes.push(r)
  }
  return routes
}

export function detectNextjsPagesRouter(f: { path: string; content: string }): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const normalizedPath = f.path.replace(/\\/g, "/")
  if (!/\/pages\/api\//.test(normalizedPath)) return routes
  if (!/\.(ts|js|tsx|jsx)$/.test(normalizedPath)) return routes
  const rel = normalizedPath.split("/pages/api/")[1]
  const urlPath = "/api/" + rel
    .replace(/\.(ts|js|tsx|jsx)$/, "")
    .replace(/\/index$/, "")
    .replace(/\[\.\.\.([^\]]+)\]/g, ":$1*")
    .replace(/\[([^\]]+)\]/g, ":$1")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
  const content = f.content; const methods = new Set<string>()
  for (const m of content.matchAll(/case\s+['"](\w+)['"]\s*:/g)) { const verb = m[1].toUpperCase(); if (HTTP_METHODS_UPPER.has(verb)) methods.add(verb) }
  for (const m of content.matchAll(/req\.method\s*===?\s*['"]([^'"]+)['"]/g)) { methods.add(m[1].toUpperCase()) }
  if (methods.size === 0) methods.add("GET")
  for (const method of methods) { const r = makeRoute(method, urlPath, ""); r.sourceFile = f.path; analyzeHandlerBody(content, r); routes.push(r) }
  return routes
}

// ── Handler body analysis ─────────────────────────────────────────────────

export function analyzeHandlerBody(body: string, r: DetectedRoute): void {
  if (/cookies\(\)\.get\(\s*['"](?:token|auth|session|access_token|github_token)['"]\)|request\.cookies\.get\(\s*['"](?:token|auth|session)['"]\)/.test(body)) { r.authRequired = true; r.authType = r.authType || "cookie"; r.reasonings?.push("Auth token en cookie") }
  if (/[Aa]uthorization.*[Bb]earer|headers\[['"]authorization['"]\]|getAuthHeader|extractBearerToken/.test(body)) { r.authRequired = true; r.authType = r.authType || "jwt"; r.reasonings?.push("Bearer token") }
  if (/getServerSession|getSession\(authOptions\)|auth\(\)\s*\.\s*then|const\s+session\s*=\s*await\s+(?:getServerSession|auth)/.test(body)) { r.authRequired = true; r.authType = r.authType || "cookie"; r.reasonings?.push("NextAuth getServerSession") }
  if (/auth\(\)|currentUser\(\)|clerkClient\.users/.test(body)) { r.authRequired = true; r.authType = r.authType || "middleware"; r.reasonings?.push("Clerk auth() / currentUser()") }
  if (/supabase\.auth\.getUser|supabase\.auth\.getSession/.test(body)) { r.authRequired = true; r.authType = r.authType || "cookie"; r.reasonings?.push("Supabase auth") }
  if (/(?:status|statusCode)\s*[:=]\s*(?:401|403)|new\s+Response\([^)]*401|NextResponse\.json\([^)]*401|res\.status\(401\)|res\.status\(403\)/.test(body)) { if (!r.authRequired) { r.authRequired = true; r.authType = r.authType || "middleware"; r.reasonings?.push("401/403 response") } }
  if (/await\s+req(?:uest)?\.json\(\)|body\s*=\s*await/.test(body)) { r.bodyType = "json"; r.reasonings?.push("JSON body") }
  if (/await\s+req(?:uest)?\.formData\(\)/.test(body)) { r.bodyType = "form"; r.reasonings?.push("FormData body") }
}

// ── Auth helpers ─────────────────────────────────────────────────────────

export function detectAuthInArgs(rawArgs: string, r: DetectedRoute): void {
  const lower = rawArgs.toLowerCase()
  if (lower.includes("passport.authenticate")) { r.authType = "passport"; r.authRequired = true; r.reasonings?.push("passport.authenticate()") }
  else if (/\b(auth|ensureauth|isauthenticated|requireauth|verifyjwt|verifytoken|authenticatejwt|authguard|isauth|checkauth|withauth|protect|guard)\b/.test(lower)) { r.authType = "middleware"; r.authRequired = true; r.reasonings?.push("Middleware auth-like") }
  if (/\b(?:401|403)\b|unauthorized|forbidden/.test(lower)) { if (!r.authRequired) { r.authRequired = true; r.authType = r.authType || "middleware"; r.reasonings?.push("401/403 in route def") } }
}

export function detectBodyTypeInArgs(rawArgs: string, r: DetectedRoute): void {
  if (/req(?:uest)?\.json\(\)|body\s*=\s*await/.test(rawArgs)) r.bodyType = "json"
  if (/req(?:uest)?\.formData\(\)/.test(rawArgs)) r.bodyType = "form"
}

export function detectAuthByStatusSignal(content: string, r: DetectedRoute): void {
  if (r.authRequired) return
  const pattern = /(?:abort\s*\(\s*(?:401|403)\s*\)|HTTPException\s*\(\s*(?:status_code\s*=\s*)?(?:401|403)\s*\)|raise\s+(?:PermissionDenied|AuthenticationFailed)|return\s+Response\s*\([^)]*status\s*[:=]\s*(?:401|403))/i
  if (pattern.test(content)) { r.authRequired = true; r.authType = r.authType || "middleware"; r.reasonings?.push("401/403 auth signal") }
}

export function inferAuthFromPathAndName(routePath: string, routeName: string): { required: boolean; type?: DetectedRoute['authType'] } {
  const lowerPath = routePath.toLowerCase(); const lowerName = routeName.toLowerCase()
  if (/(\/(admin|dashboard|profile|settings|account|private|protected|user\/[^/]+|me|secure)(?:\/|$))/i.test(routePath)) return { required: true, type: "middleware" }
  if (/(\/(login|signup|register|forgot-password|public|health|status|ping|docs|swagger)(?:\/|$))/i.test(routePath)) return { required: false }
  if (/private|protected|secure|admin|authenticated|restricted|member-only/i.test(routeName + lowerPath)) return { required: true, type: "middleware" }
  if (/public|open|guest|anonymous|free|unrestricted/i.test(routeName + lowerPath)) return { required: false }
  return { required: false }
}

// ── Utility helpers ───────────────────────────────────────────────────────

export function parseMethodList(raw: string): string[] {
  const methods = new Set<string>()
  for (const m of raw.matchAll(/['"]([^'"]+)['"]/g)) { const normalized = m[1].toUpperCase().trim(); if (normalized) methods.add(normalized) }
  for (const m of raw.matchAll(/\bHttpMethod\.([A-Z]+)\b/g)) methods.add(m[1])
  for (const m of raw.matchAll(/\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|ALL)\b/g)) methods.add(m[1])
  return [...methods]
}

function detectGoEnhanced(content: string): DetectedRoute[] {
  const result = detectGo(content)
  const enhanced: DetectedRoute[] = []
  const seen = new Set<string>()
  
  // Standard library patterns
  const HTTP_RE = /http\.Handle(?:Func)?\s*\(\s*['"]([^'"]+)['"]\s*,/g
  for (const m of content.matchAll(HTTP_RE)) {
    const path = normalizePath(m[1])
    const key = `GET|${path}`
    if (!seen.has(key) && !result.some(r => r.path === path)) {
      seen.add(key)
      enhanced.push(makeRoute("GET", path, ""))
    }
  }
  
  // Merge
  for (const r of result) {
    const key = `${r.method}|${r.path}`
    if (!seen.has(key)) {
      seen.add(key)
      enhanced.push(r)
    }
  }
  
  return enhanced
}

// ── Rust enhanced detector ────────────────────────────────────────────────

function detectRustEnhanced(content: string): DetectedRoute[] {
  const result = detectRust(content)
  const enhanced: DetectedRoute[] = []
  const seen = new Set<string>()
  
  // Actix-web service() patterns
  const SERVICE_RE = /\.route\s*\(\s*['"]([^'"]+)['"]\s*,\s*web::(get|post|put|delete|patch)\s*\(/g
  for (const m of content.matchAll(SERVICE_RE)) {
    const path = normalizePath(m[1])
    const method = m[2].toUpperCase()
    const key = `${method}|${path}`
    if (!seen.has(key) && !result.some(r => r.method === method && r.path === path)) {
      seen.add(key)
      enhanced.push(makeRoute(method, path, ""))
    }
  }
  
  // Merge
  for (const r of result) {
    const key = `${r.method}|${r.path}`
    if (!seen.has(key)) {
      seen.add(key)
      enhanced.push(r)
    }
  }
  
  return enhanced
}

// ── Swift enhanced detector ──────────────────────────────────────────────

function detectSwiftEnhanced(content: string): DetectedRoute[] {
  const result = detectSwift(content)
  const enhanced: DetectedRoute[] = []
  const seen = new Set<string>()
  
  // Vapor patterns
  const VAPOR_RE = /app\.(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['\"]\s*\)/g
  for (const m of content.matchAll(VAPOR_RE)) {
    const path = normalizePath(m[1])
    const key = `GET|${path}`
    if (!seen.has(key) && !result.some(r => r.path === path)) {
      seen.add(key)
      enhanced.push(makeRoute("GET", path, ""))
    }
  }
  
  // Merge
  for (const r of result) {
    const key = `${r.method}|${r.path}`
    if (!seen.has(key)) {
      seen.add(key)
      enhanced.push(r)
    }
  }
  
  return enhanced
}

// ── Haskell enhanced detector ──────────────────────────────────────────────

function detectHaskellEnhanced(content: string): DetectedRoute[] {
  const result = detectServant(content)
  const enhanced: DetectedRoute[] = []
  const seen = new Set<string>()
  
  // Additional Servant patterns
  const SERVANT_RE = /["']\/([^"']+)["']\s*:>/g
  for (const m of content.matchAll(SERVANT_RE)) {
    const path = normalizePath("/" + m[1])
    const key = `GET|${path}`
    if (!seen.has(key) && !result.some(r => r.path === path)) {
      seen.add(key)
      enhanced.push(makeRoute("GET", path, ""))
    }
  }
  
  // Merge
  for (const r of result) {
    const key = `${r.method}|${r.path}`
    if (!seen.has(key)) {
      seen.add(key)
      enhanced.push(r)
    }
  }
  
  return enhanced
}

// ── Sinatra enhanced detector ──────────────────────────────────────────────

function detectSinatraEnhanced(content: string): DetectedRoute[] {
  const result: DetectedRoute[] = []
  const seen = new Set<string>()
  
  // Sinatra specific patterns
  const SINATRA_RE = /(get|post|put|delete|patch|options|head)\s+['"]([^'"]+)['"]\s*(?:do|{|=>)/g
  for (const m of content.matchAll(SINATRA_RE)) {
    const method = m[1].toUpperCase()
    const path = normalizePath(m[2])
    const key = `${method}|${path}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(makeRoute(method, path, ""))
    }
  }
  
  return result
}

// ── Laravel enhanced detector ────────────────────────────────────────────────

function detectLaravelEnhanced(content: string): DetectedRoute[] {
  const result = detectLaravel(content)
  const enhanced: DetectedRoute[] = []
  const seen = new Set<string>()
  
  // Additional patterns for implicit routes
  const IMPLICIT_ROUTE_RE = /Route::\w+\s*\(\s*['"]([^'\"]+)['"](?:\s*,|\s*,\s*function)/g
  for (const m of content.matchAll(IMPLICIT_ROUTE_RE)) {
    const path = normalizePath(m[1])
    const key = `GET|${path}`
    if (!seen.has(key) && !result.some(r => r.path === path)) {
      seen.add(key)
      enhanced.push(makeRoute("GET", path, ""))
    }
  }
  
  // Merge with existing
  for (const r of result) {
    const key = `${r.method}|${r.path}`
    if (!seen.has(key)) {
      seen.add(key)
      enhanced.push(r)
    }
  }
  
  return enhanced
}

// ── Rails enhanced detector ────────────────────────────────────────────────

function detectRailsEnhanced(content: string): DetectedRoute[] {
  const result = detectRails(content)
  const enhanced: DetectedRoute[] = []
  const seen = new Set<string>()
  
  // RESTful route patterns
  const REST_RE = /\b(get|post|put|patch|delete)\s+['"]([^'"]+)['"]\s*(?:,\s*to\s*:|=>)/g
  for (const m of content.matchAll(REST_RE)) {
    const method = m[1].toUpperCase()
    const path = normalizePath(m[2])
    const key = `${method}|${path}`
    if (!seen.has(key) && !result.some(r => r.method === method && r.path === path)) {
      seen.add(key)
      enhanced.push(makeRoute(method, path, ""))
    }
  }
  
  // Merge
  for (const r of result) {
    const key = `${r.method}|${r.path}`
    if (!seen.has(key)) {
      seen.add(key)
      enhanced.push(r)
    }
  }
  
  return enhanced
}

// ── Global enhancement pipeline ──────────────────────────────────────────

function enhanceDetectionResults(routes: DetectedRoute[], content: string, framework: string): DetectedRoute[] {
  const seen = new Set<string>()
  const deduped: DetectedRoute[] = []
  
  for (const route of routes) {
    // Ensure path is normalized
    route.path = normalizePath(route.path)
    
    // Generate deduplication key
    const key = `${route.method}|${route.path}`
    if (seen.has(key)) continue
    seen.add(key)
    
    // Auto-detect auth patterns across frameworks
    if (!route.authRequired) {
      const authPatterns = [
        /\b(?:auth|authenticate|jwt|token|bearer|oauth|permission|role|guard|middleware)\b/i,
        /401|403|Unauthorized|Forbidden/i,
        /\.isAuth\(|\.checkAuth\(|\.requireAuth\(|\.protected\(|\.private\(/i,
      ]
      
      for (const pattern of authPatterns) {
        if (pattern.test(content)) {
          route.authRequired = true
          route.authType = "middleware"
          if (!route.reasonings) route.reasonings = []
          route.reasonings.push(`Possible auth pattern detected`)
          break
        }
      }
    }
    
    // Set confidence based on signals
    if (!route.confidence) {
      const signals = [
        route.authRequired,
        route.bodyType !== "none",
        route.middlewareChain && route.middlewareChain.length > 0,
        route.description && route.description.length > 0,
        route.reasonings && route.reasonings.length > 0,
      ]
      const signalCount = signals.filter(Boolean).length
      route.confidence = signalCount >= 3 ? "HIGH" : signalCount >= 1 ? "MEDIUM" : "LOW"
    }
    
    deduped.push(route)
  }
  
  return deduped
}

function wrapDetector(detector: (content: string) => DetectedRoute[], framework: string): (content: string) => DetectedRoute[] {
  return (content: string) => {
    const routes = detector(content)
    return enhanceDetectionResults(routes, content, framework)
  }
}

// ── Route dispatcher ─────────────────────────────────────────────────────

export async function matchFramework(content: string, framework: string, fp: string): Promise<DetectedRoute[]> {
  let routes: DetectedRoute[]
  
  switch (framework) {
    case "express": routes = detectExpress(content); break
    case "nextjs": routes = []; break
    case "fastapi": routes = detectFastAPI(content); break
    case "flask": routes = detectFlask(content); break
    case "django": routes = detectDjango(content); break
    case "tornado": routes = detectTornado(content); break
    case "sanic": routes = detectSanic(content); break
    case "starlette": routes = detectStarlette(content); break
    case "litestar": routes = detectLitestar(content); break
    case "aiohttp": routes = detectAiohttp(content); break
    case "falcon": routes = detectFalcon(content); break
    case "nestjs": routes = detectNestJS(content); break
    case "laravel": routes = detectLaravelEnhanced(content); break
    case "fastify": routes = detectFastify(content); break
    case "koa": routes = detectKoa(content); break
    case "hapi": routes = detectHapi(content); break
    case "kotlin": routes = detectKtor(content); break
    case "rails": routes = detectRailsEnhanced(content); break
    case "phoenix": routes = detectPhoenix(content); break
    case "spring": routes = await detectSpring(content); break
    case "micronaut": routes = await detectMicronaut(content); break
    case "quarkus": routes = await detectQuarkus(content); break
    case "aspnet": routes = detectAspNet(content); break
    case "go": routes = detectGoEnhanced(content); break
    case "haskell": routes = detectHaskellEnhanced(content); break
    case "rust": routes = detectRustEnhanced(content); break
    case "swift": routes = detectSwiftEnhanced(content); break
    case "sinatra": routes = detectSinatraEnhanced(content); break
    case "actix": routes = detectActix(content); break
    case "axum": routes = detectAxum(content); break
    case "rocket": routes = detectRocket(content); break
    default:
      routes = [
        ...detectExpress(content), ...detectFastify(content), ...detectKoa(content),
        ...detectHapi(content), ...detectFastAPI(content), ...detectFlask(content),
        ...detectDjango(content), ...detectTornado(content), ...detectSanic(content),
        ...detectStarlette(content), ...detectLitestar(content), ...detectAiohttp(content),
        ...detectFalcon(content), ...detectNestJS(content), ...detectLaravelEnhanced(content),
        ...detectRailsEnhanced(content), ...detectPhoenix(content),
        ...(await detectSpring(content)),
        ...(await detectMicronaut(content)),
        ...(await detectQuarkus(content)),
        ...detectKtor(content),
        ...detectAspNet(content), ...detectGoEnhanced(content), ...detectHaskellEnhanced(content),
        ...detectRustEnhanced(content), ...detectSwiftEnhanced(content), ...detectSinatraEnhanced(content),
      ]
  }
  
  // Apply AST-like enhancements to ALL results
  return enhanceDetectionResults(routes, content, framework)
}

export async function detectRoutes(content: string, filePath: string, framework: string): Promise<DetectedRoute[]> {
  try {
    await ensureTreeSitterLoaded()
    const tsRoutes = await detectRoutesWithTreeSitter!(content, filePath, framework)
    if (tsRoutes.length > 0) {
      return tsRoutes.map((r) => {
        const route = makeRoute(r.method, r.path, r.name || "")
        if (r.controller) route.controller = r.controller
        if (r.authRequired) { route.authRequired = true; route.authType = "jwt" }
        return route
      })
    }
    console.debug(`[tree-sitter] no routes for ${filePath} (${framework}) — falling back to regex`)
  } catch (e) {
    console.debug(`[tree-sitter] unavailable for ${filePath} (${framework}): ${e instanceof Error ? e.message : e}`)
  }

  const raw = await matchFramework(content, framework, filePath)
  const seen = new Set<string>()
  return raw.filter((r) => {
    const key = `${r.method}|${r.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Rust detectors (Actix-web, Axum, Rocket) ───────────────────────────

export function detectActix(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  // Actix-web: .route("/path", web::get().to(handler)) or .route("/path", web::get().to(handler))
  const ROUTE_RE = /\.route\s*\(\s*['"]([^'"]+)['"]\s*,\s*web::(get|post|put|delete|patch)\s*\(/g
  for (const m of content.matchAll(ROUTE_RE)) { addRoute(routes, seen, m[2].toUpperCase(), m[1]) }
  // Actix-web: .service(web::resource("/path").route(web::get().to(handler)))
  const RESOURCE_RE = /web::resource\s*\(\s*['"]([^'"]+)['"]/g
  for (const m of content.matchAll(RESOURCE_RE)) { addRoute(routes, seen, "GET", m[1]) }
  return routes
}

export function detectAxum(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  // Axum: Router::new().route("/path", get(handler))
  const ROUTE_RE = /\.route\s*\(\s*['"]([^'"]+)['"]\s*,\s*(get|post|put|delete|patch|any)/g
  for (const m of content.matchAll(ROUTE_RE)) {
    const method = m[2] === "any" ? "GET" : m[2].toUpperCase()
    addRoute(routes, seen, method, m[1])
  }
  // Axum: .nest("/api", router)
  const NEST_RE = /\.nest\s*\(\s*['"]([^'"]+)['"]/g
  for (const m of content.matchAll(NEST_RE)) { addRoute(routes, seen, "GET", m[1]) }
  return routes
}

export function detectRocket(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  // Rocket: #[get("/path")]
  const ATTR_RE = /#\[\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const m of content.matchAll(ATTR_RE)) { addRoute(routes, seen, m[1].toUpperCase(), m[2]) }
  // Rocket: routes![get, post]
  const ROUTES_MACRO = /routes!\s*\[([^\]]+)\]/g
  for (const m of content.matchAll(ROUTES_MACRO)) {
    for (const route of m[1].split(",").map(s => s.trim())) {
      if (route) addRoute(routes, seen, "GET", `/${route}`)
    }
  }
  return routes
}

export function detectRust(content: string): DetectedRoute[] {
  return [...detectActix(content), ...detectAxum(content), ...detectRocket(content)]
}

// ── Swift/Vapor detector ───────────────────────────────────────────────

export function detectSwift(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  // Vapor: app.get("path") { req in ... }
  const VAPOR_RE = /(?:app|router|routes)\s*\.\s*(get|post|put|delete|patch|options|head)\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const m of content.matchAll(VAPOR_RE)) { addRoute(routes, seen, m[1].toUpperCase(), m[2]) }
  // Vapor: router.group("path") { ... }
  const GROUP_RE = /(?:app|router|routes)\s*\.\s*group\s*\(\s*['"]([^'"]+)['"]/g
  for (const m of content.matchAll(GROUP_RE)) { addRoute(routes, seen, "GET", m[1]) }
  // Vapor: routes.get("path", use: handler)
  const REGISTER_RE = /routes\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]\s*,/g
  for (const m of content.matchAll(REGISTER_RE)) { addRoute(routes, seen, m[1].toUpperCase(), m[2]) }
  // Kitura / Kitura-NIO: router.get("/path", handler)
  const KITURA_RE = /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g
  for (const m of content.matchAll(KITURA_RE)) { addRoute(routes, seen, m[1].toUpperCase(), m[2]) }
  return routes
}

// ── Frontend API call scanning ──────────────────────────────────────────

export function scanFrontendApiCalls(files: { path: string; content: string }[]): Set<string> {
  const calledPaths = new Set<string>()
  const patterns: RegExp[] = [
    /\bfetch\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    /\baxios\.(?:get|post|put|delete|patch|request)\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    /\bky(?:\.(?:get|post|put|delete|patch))?\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    /\$fetch\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    /\buseFetch\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    /\buseSWR\s*\(\s*(['"`])([^'"`\n]+)\1/g,
    /useQuery\s*\(\s*\[\s*(['"`])([^'"`\n]+)\1/g,
    /\baxios\s*\(\s*\{\s*url\s*:\s*(['"`])([^'"`\n]+)\1/g,
    /url\s*:\s*(['"`])([^'"`\n]+)\1/g,
  ]
  for (const file of files) {
    const content = file.content
    for (const pattern of patterns) {
      pattern.lastIndex = 0; let m
      while ((m = pattern.exec(content)) !== null) {
        const called = m[2]
        if (called && called.length > 1 && (called.startsWith("/") || called.startsWith("http"))) {
          const normalized = normalizePath(called.startsWith("http") ? called.replace(/^https?:\/\/[^/]+/, "") : called)
          if (normalized && normalized !== "/") {
            calledPaths.add(normalized)
            const withWildcard = normalized.replace(/\$\{[^}]+\}/g, "*")
            if (withWildcard !== normalized) calledPaths.add(withWildcard)
          }
        }
      }
    }
    for (const m of content.matchAll(/\$\{[A-Za-z_$][\w$]*\}([/a-z0-9_-]+)/gi)) {
      if (m[1]) calledPaths.add(normalizePath(m[1]))
    }
  }
  return calledPaths
}

export function correlateWithFrontendCall(routePath: string, frontendCall: string): boolean {
  if (frontendCall === routePath) return true
  if (frontendCall.endsWith(routePath)) return true
  if (routePath.includes(frontendCall)) return true
  const routeRegex = new RegExp("^" + routePath.replace(/:[a-zA-Z_]\w*\*/g, ".+").replace(/:[a-zA-Z_]\w*/g, "[^/]+") + "$")
  if (routeRegex.test(frontendCall)) return true
  const normRoute = routePath.replace(/:[a-zA-Z_]\w*/g, "*")
  const normFrontend = frontendCall.replace(/\/\d+/g, "/*")
  if (normRoute === normFrontend) return true
  return false
}

// ── Next.js tree-based detection (for GitHub import) ────────────────────

export function detectNextJsRoutesFromTree(paths: string[]): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  for (const p of paths) {
    let match = p.match(/(?:^|\/)app\/api\/(.+)\/route\.(ts|js|mjs)$/)
    if (match) { routes.push(makeRoute("GET", `/api/${match[1]}`, "")); continue }
    match = p.match(/(?:^|\/)pages\/api\/(.+)\.(ts|js|mjs)$/)
    if (match) {
      let path = `/api/${match[1]}`
      if (path.endsWith("/index")) path = path.replace(/\/index$/, "")
      routes.push(makeRoute("GET", path, ""))
    }
  }
  return routes
}

// ── Robustness: Entry point detection ───────────────────────────────────

export function findEntryPoint(files: { path: string; content: string }[]): string | null {
  const paths = files.map(f => f.path.replace(/\\/g, "/"))
  
  // Package.json main field (highest priority)
  const pkgFile = files.find(f => f.path.endsWith("package.json"))
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content)
      if (pkg.main || pkg.bin) {
        const mainPath = pkg.main || Object.values(pkg.bin || {})[0]
        if (mainPath) {
          const found = files.find(f => f.path.replace(/\\/g, "/").endsWith(mainPath as string))
          if (found) return found.path
        }
      }
    } catch {}
  }
  
  // Common patterns by language
  const entryPatterns = [
    // Node.js
    /^(.*\/)?(server|index|app|main)\.(ts|js|mjs)$/,
    /^(.*\/)?src\/(server|index|app|main)\.(ts|js)$/,
    /^(.*\/)?(src\/)?index\.ts$/,
    /^(.*\/)?dist\/index\.js$/,
    // Python
    /^(.*\/)?(main|app|server|wsgi|asgi)\.py$/,
    /^(.*\/)?src\/(main|app|server)\.py$/,
    // Go
    /^(.*\/)?main\.go$/,
    // Rust
    /^(.*\/)?src\/main\.rs$/,
    // Ruby
    /^(.*\/)?(app|config\.ru)$/,
    // Java
    /^(.*\/)?Main\.java$/,
    /^(.*\/)?Application\.java$/,
  ]
  
  for (const pattern of entryPatterns) {
    const match = paths.find(p => pattern.test(p))
    if (match) return match
  }
  
  return null
}

// ── Robustness: Middleware chain tracking ──────────────────────────────

export function analyzeMiddlewareChain(files: { path: string; content: string }[], framework: string): Map<string, string[]> {
  const middlewareByRoute = new Map<string, string[]>()
  const globalMiddleware: string[] = []
  
  if (framework === "express" || framework === "fastify" || framework === "koa") {
    for (const file of files) {
      const content = file.content
      
      // Track app.use() / middleware declarations
      const MIDDLEWARE_RE = /(?:app|server)\s*\.\s*use\s*\(\s*(?:["']([^"']+)["']\s*,\s*)?([A-Za-z_]\w*)\s*\)/g
      for (const m of content.matchAll(MIDDLEWARE_RE)) {
        const path = m[1] || "/"
        const middlewareName = m[2]
        if (path === "/") {
          globalMiddleware.push(middlewareName)
        } else {
          const key = `${path}|*`
          middlewareByRoute.set(key, [...(middlewareByRoute.get(key) || []), middlewareName])
        }
      }
      
      // Track route-specific middleware
      const ROUTE_MIDDLEWARE_RE = /app\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]\s*,\s*([\w\s,]+)\s*,\s*(?:async\s+)?(?:function|\([^)]*\)|=>)/g
      for (const m of content.matchAll(ROUTE_MIDDLEWARE_RE)) {
        const path = m[1]
        const middlewares = m[2].split(",").map(s => s.trim())
        middlewareByRoute.set(path, middlewares)
      }
    }
  } else if (framework === "django") {
    // Django middleware in settings
    for (const file of files) {
      if (!file.path.includes("settings")) continue
      const MIDDLEWARE_RE = /MIDDLEWARE\s*=\s*\[([\s\S]*?)\]/
      const match = file.content.match(MIDDLEWARE_RE)
      if (match) {
        const middlewares = match[1].match(/['"]([^'"]+)['"]/g) || []
        middlewares.forEach(m => globalMiddleware.push(m.replace(/["']/g, "")))
      }
    }
  }
  
  return middlewareByRoute
}

// ── Robustness: Dynamic routes detection ────────────────────────────────

export function detectDynamicRoutes(files: { path: string; content: string }[]): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const seen = new Set<string>()
  
  for (const file of files) {
    const content = file.content
    
    // Pattern 1: forEach/map on route arrays
    // const routes = ['/users', '/posts']; routes.forEach(r => app.get(r, ...))
    const ROUTE_ARRAY_RE = /const\s+\w+\s*=\s*\[([\s\S]*?)\]\s*;?\s*(?:\/\/|[\n\r])\s*(?:\.forEach|\.map|\.for)\s*\(\s*(?:async\s+)?\(?\s*\w+\s*\)?\s*=>\s*(?:app|server)\s*\.\s*(?:get|post|put|delete|patch)/g
    for (const m of content.matchAll(ROUTE_ARRAY_RE)) {
      const arrayContent = m[1]
      const pathMatches = arrayContent.match(/['"]([^'"]+)['"]/g) || []
      for (const pathMatch of pathMatches) {
        const path = pathMatch.replace(/['\"]/g, "")
        const key = `*|${path}`
        if (!seen.has(key)) {
          seen.add(key)
          const route = makeRoute("GET", path, "")
          route.reasonings = ["Dynamic route detected (generated from array)"]
          route.confidence = "MEDIUM"
          routes.push(route)
        }
      }
    }
    
    // Pattern 2: Object iteration
    // for (const method in methods) { app[method](path, handler) }
    const DYNAMIC_METHOD_RE = /for\s*\(\s*(?:const|var)\s+(\w+)\s+in\s+(\w+)\s*\)\s*\{\s*(?:app|server)\s*\[\s*\1\s*\]\s*\(\s*['"]([^'"]+)['"]/g
    for (const m of content.matchAll(DYNAMIC_METHOD_RE)) {
      const path = m[3]
      const key = `*|${path}`
      if (!seen.has(key)) {
        seen.add(key)
        const route = makeRoute("GET", path, "")
        route.reasonings = ["Dynamic route (generated from method iteration)"]
        route.confidence = "MEDIUM"
        routes.push(route)
      }
    }
    
    // Pattern 3: Conditional routes
    // if (process.env.ENABLE_ADMIN) { app.get('/admin', ...) }
    const CONDITIONAL_ROUTE_RE = /if\s*\(\s*(?:process\.env|config)\.\w+\s*\)\s*\{\s*(?:app|server)\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g
    for (const m of content.matchAll(CONDITIONAL_ROUTE_RE)) {
      const path = m[1]
      const key = `?|${path}`
      if (!seen.has(key)) {
        seen.add(key)
        const route = makeRoute("GET", path, "")
        route.reasonings = ["Conditional route (may not always exist)"]
        route.confidence = "LOW"
        routes.push(route)
      }
    }
  }
  
  return routes
}

// ── Python AST-based route detection (robust, all frameworks) ─────────────

function detectPythonRoutesAST(content: string, targetFramework?: string): DetectedRoute[] {
  try {
    if (typeof window !== "undefined") return []
    const cpRequire = Function('return require("child_process")')()
    const spawnSync = cpRequire.spawnSync as typeof import("child_process")["spawnSync"]
    const py = spawnSync("python", ["-c", `
import ast, sys, json, re

src = sys.stdin.read()
try:
    tree = ast.parse(src)
except SyntaxError:
    print(json.dumps([]))
    sys.exit(0)

routes = []

def get_str(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Str):
        return node.s
    return None

def get_method_name(deco):
    if isinstance(deco, ast.Call) and hasattr(deco.func, 'attr'):
        return deco.func.attr
    if isinstance(deco, ast.Call) and hasattr(deco.func, 'id'):
        return deco.func.id
    return None

def extract_method_list(call_node):
    for kw in getattr(call_node, 'keywords', []):
        if kw.arg == 'methods' and isinstance(kw.value, (ast.List, ast.Tuple)):
            return [get_str(elt) for elt in kw.value.elts if get_str(elt)]
    return []

def extract_decorator_path(deco):
    if isinstance(deco, ast.Call) and deco.args:
        return get_str(deco.args[0])
    return None

def detect_flask(routes, tree):
    bps = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call) and hasattr(node.value.func, 'id') and node.value.func.id == 'Blueprint':
            up = ''
            for kw in node.value.keywords:
                if kw.arg == 'url_prefix': up = get_str(kw.value) or ''
            if node.targets and hasattr(node.targets[0], 'id'): bps[node.targets[0].id] = up
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for deco in node.decorator_list:
                mn = get_method_name(deco)
                if mn in ('route','get','post','put','delete','patch','options','head'):
                    path = extract_decorator_path(deco)
                    if path:
                        methods = extract_method_list(deco) if mn == 'route' else [mn.upper()]
                        if not methods: methods = ['GET']
                        ctrl = None; pref = None
                        if isinstance(deco, ast.Call) and hasattr(deco.func, 'value') and hasattr(deco.func.value, 'id'):
                            ctrl = deco.func.value.id
                            pref = bps.get(ctrl)
                        for m in methods:
                            fp = pref.rstrip('/') + '/' + path.lstrip('/') if pref else path
                            routes.append({"method": m, "path": fp, "name": node.name, "framework": "flask", "controller": ctrl})
    for node in ast.walk(tree):
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            call = node.value
            if hasattr(call.func, 'attr') and call.func.attr == 'add_url_rule' and call.args:
                path = get_str(call.args[0])
                if path:
                    for m in extract_method_list(call) or ['GET']:
                        routes.append({"method": m, "path": path, "name": "", "framework": "flask"})

def detect_fastapi(routes, tree):
    rtrs = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call) and hasattr(node.value.func, 'id') and node.value.func.id == 'APIRouter':
            p = ''
            for kw in node.value.keywords:
                if kw.arg == 'prefix': p = get_str(kw.value) or ''
            if node.targets and hasattr(node.targets[0], 'id'): rtrs[node.targets[0].id] = p
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for deco in node.decorator_list:
                mn = get_method_name(deco)
                if mn in ('get','post','put','delete','patch','options','head'):
                    path = extract_decorator_path(deco)
                    if path:
                        ctrl = None; p = ''
                        if isinstance(deco, ast.Call) and hasattr(deco.func, 'value') and hasattr(deco.func.value, 'id'):
                            ctrl = deco.func.value.id
                            p = rtrs.get(ctrl, '')
                        fp = p + '/' + path.lstrip('/') if p else path
                        ri = {"method": mn.upper(), "path": fp, "name": node.name, "framework": "fastapi", "controller": ctrl}
                        if deco.keywords:
                            for kw in deco.keywords:
                                if kw.arg == 'dependencies' and isinstance(kw.value, ast.List): ri['auth'] = True
                        routes.append(ri)
    for node in ast.walk(tree):
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            call = node.value
            if hasattr(call.func, 'attr') and call.func.attr == 'include_router' and call.args and hasattr(call.args[0], 'id'):
                ip = ''
                for kw in call.keywords:
                    if kw.arg == 'prefix': ip = get_str(kw.value) or ''
                if call.args[0].id in rtrs and ip:
                    rtrs[call.args[0].id] = ip + '/' + rtrs[call.args[0].id].lstrip('/')

def detect_django(routes, tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and node.targets and hasattr(node.targets[0], 'id') and node.targets[0].id == 'urlpatterns' and isinstance(node.value, ast.List):
            for elt in node.value.elts:
                if isinstance(elt, ast.Call) and hasattr(elt.func, 'id') and elt.func.id in ('path','re_path') and elt.args:
                    path = get_str(elt.args[0])
                    vn = ''
                    if len(elt.args) > 1:
                        v = elt.args[1]
                        vn = v.id if hasattr(v, 'id') else (v.attr if hasattr(v, 'attr') else '')
                    if path:
                        routes.append({"method": "GET", "path": path, "name": vn, "framework": "django"})
    for node in ast.walk(tree):
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            call = node.value
            if hasattr(call.func, 'attr') and call.func.attr == 'register' and call.args:
                path = get_str(call.args[0])
                if path:
                    for m in ('GET','POST','PUT','DELETE','PATCH'):
                        routes.append({"method": m, "path": '/' + path.lstrip('/'), "name": "", "framework": "django"})

def detect_tornado(routes, tree):
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for deco in node.decorator_list:
                if isinstance(deco, ast.Call) and hasattr(deco.func, 'id') and deco.func.id == 'route':
                    path = extract_decorator_path(deco)
                    if path:
                        routes.append({"method": "GET", "path": path, "name": node.name, "framework": "tornado"})
    for node in ast.walk(tree):
        is_app_call = False
        if isinstance(node, ast.Call):
            if hasattr(node.func, 'id') and node.func.id == 'Application':
                is_app_call = True
            elif hasattr(node.func, 'attr') and node.func.attr == 'Application':
                is_app_call = True
        if is_app_call and node.args and isinstance(node.args[0], ast.List):
            for elt in node.args[0].elts:
                if isinstance(elt, ast.Tuple) and len(elt.elts) >= 2:
                    path = get_str(elt.elts[0])
                    if path:
                        routes.append({"method": "GET", "path": path, "name": "", "framework": "tornado"})

def detect_sanic(routes, tree):
    bps = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call) and hasattr(node.value.func, 'id') and node.value.func.id == 'Blueprint':
            up = ''
            for kw in node.value.keywords:
                if kw.arg == 'url_prefix': up = get_str(kw.value) or ''
            if node.targets and hasattr(node.targets[0], 'id'): bps[node.targets[0].id] = up
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for deco in node.decorator_list:
                mn = get_method_name(deco)
                if mn in ('get','post','put','delete','patch','options','head','route'):
                    path = extract_decorator_path(deco)
                    if path:
                        methods = extract_method_list(deco) if mn == 'route' else [mn.upper()]
                        if not methods: methods = ['GET']
                        ctrl, tp = None, None
                        if isinstance(deco, ast.Call) and hasattr(deco.func, 'value') and hasattr(deco.func.value, 'id'):
                            ctrl = deco.func.value.id
                            tp = bps.get(ctrl)
                        for m in methods:
                            fp = tp.rstrip('/') + '/' + path.lstrip('/') if tp else path
                            routes.append({"method": m, "path": fp, "name": node.name, "framework": "sanic", "controller": ctrl})
    for node in ast.walk(tree):
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            call = node.value
            if hasattr(call.func, 'attr') and call.func.attr == 'add_route' and len(call.args) >= 2:
                path = get_str(call.args[1])
                if path:
                    routes.append({"method": "GET", "path": path, "name": "", "framework": "sanic"})

def detect_starlette(routes, tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and hasattr(node.func, 'id') and node.func.id == 'Route':
            path = None; endpoint = ''; methods = ['GET']
            if node.args: path = get_str(node.args[0])
            for kw in getattr(node, 'keywords', []):
                if kw.arg == 'path': path = get_str(kw.value)
                elif kw.arg == 'endpoint' and hasattr(kw.value, 'id'): endpoint = kw.value.id
                elif kw.arg == 'methods':
                    em = extract_method_list(type('obj', (object,), {'keywords': [type('obj', (object,), {'arg': 'methods', 'value': kw.value})()]})())
                    if em: methods = em
            if path:
                for m in methods:
                    routes.append({"method": m, "path": path, "name": endpoint, "framework": "starlette"})

def detect_litestar(routes, tree):
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for deco in node.decorator_list:
                mn = get_method_name(deco)
                if mn in ('get','post','put','delete','patch','options','head','route'):
                    path = extract_decorator_path(deco)
                    if path:
                        methods = extract_method_list(deco) if mn == 'route' else [mn.upper()]
                        if not methods: methods = ['GET']
                        for m in methods:
                            routes.append({"method": m, "path": path, "name": node.name, "framework": "litestar"})

def detect_aiohttp(routes, tree):
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for deco in node.decorator_list:
                mn = get_method_name(deco)
                if mn in ('get','post','put','delete','patch','options','head'):
                    path = extract_decorator_path(deco)
                    if path:
                        routes.append({"method": mn.upper(), "path": path, "name": node.name, "framework": "aiohttp"})
    for node in ast.walk(tree):
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            call = node.value
            if hasattr(call.func, 'attr'):
                attr = call.func.attr
                mm = {'add_get':'GET','add_post':'POST','add_put':'PUT','add_delete':'DELETE','add_patch':'PATCH','add_route':'GET'}
                if attr in mm and call.args:
                    path = get_str(call.args[0])
                    if path:
                        routes.append({"method": mm[attr], "path": path, "name": "", "framework": "aiohttp"})

def detect_falcon(routes, tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            call = node.value
            if hasattr(call.func, 'attr') and call.func.attr == 'add_route' and len(call.args) >= 1:
                path = get_str(call.args[0])
                if path:
                    rn = call.args[1].id if len(call.args) >= 2 and hasattr(call.args[1], 'id') else ''
                    routes.append({"method": "GET", "path": path, "name": rn, "framework": "falcon"})

flags = {
    'flask': bool(re.search(r'from\\s+flask\\s+import|import\\s+flask|Flask\\s*\\(', src)),
    'fastapi': bool(re.search(r'from\\s+fastapi\\s+import|import\\s+fastapi|FastAPI\\s*\\(', src)),
    'django': bool(re.search(r'from\\s+django\\s+import|import\\s+django|django\\.urls|urlpatterns\\s*=', src)),
    'tornado': bool(re.search(r'from\\s+tornado\\s+import|import\\s+tornado|tornado\\.web|RequestHandler', src)),
    'sanic': bool(re.search(r'from\\s+sanic\\s+import|import\\s+sanic|Sanic\\s*\\(', src)),
    'starlette': bool(re.search(r'from\\s+starlette\\s+import|import\\s+starlette|starlette\\.routing', src)),
    'litestar': bool(re.search(r'from\\s+litestar\\s+import|import\\s+litestar|Litestar\\s*\\(', src)),
    'aiohttp': bool(re.search(r'from\\s+aiohttp\\s+import|import\\s+aiohttp|aiohttp\\.web', src)),
    'falcon': bool(re.search(r'from\\s+falcon\\s+import|import\\s+falcon|falcon\\.(API|App|api)', src)),
}

if flags['flask']: detect_flask(routes, tree)
if flags['fastapi']: detect_fastapi(routes, tree)
if flags['django']: detect_django(routes, tree)
if flags['tornado']: detect_tornado(routes, tree)
if flags['sanic']: detect_sanic(routes, tree)
if flags['starlette']: detect_starlette(routes, tree)
if flags['litestar']: detect_litestar(routes, tree)
if flags['aiohttp']: detect_aiohttp(routes, tree)
if flags['falcon']: detect_falcon(routes, tree)

if not any(flags.values()):
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for deco in node.decorator_list:
                mn = get_method_name(deco)
                if mn in ('get','post','put','delete','patch','options','head','route'):
                    path = extract_decorator_path(deco)
                    if path:
                        routes.append({"method": mn.upper() if mn != 'route' else 'GET', "path": path, "name": node.name, "framework": "unknown_python"})

print(json.dumps(routes))
`], { input: content, encoding: "utf8" })
    if (py.status !== 0) { console.error("Python AST error:", py.stderr?.toString()); return [] }
    if (py.stdout) {
      const parsed = JSON.parse(py.stdout.toString())
      if (!targetFramework) return parsed.map((r: any) => makeRoute(r.method, r.path, r.name))
      return parsed
        .filter((r: any) => r.framework === targetFramework)
        .map((r: any) => {
          const route = makeRoute(r.method, r.path, r.name || "")
          if (r.controller) route.controller = r.controller
          if (r.auth) { route.authRequired = true; route.authType = "jwt"; route.reasonings?.push("Auth detecte par AST Python") }
          return route
        })
    }
  } catch {}
  return []
}

