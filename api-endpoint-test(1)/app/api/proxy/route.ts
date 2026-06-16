import { NextRequest, NextResponse } from "next/server"
import { getMockRoutes, isMockEnabledForWorkspace } from "@/app/api/mock/config/route"
import { matchMockRoute } from "@/lib/match-mock-path"

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
const MAX_BODY_SIZE = 10 * 1024 * 1024 // 10 MB

const PRIVATE_HOSTS = [
  "127.0.0.1", "127.", "::1", "localhost",
  "0.0.0.0", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
  "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
  "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
  "192.168.", "169.254.",
]

// ── In-memory rate limiter ──────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 100

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// Clean stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitMap) {
      if (entry.resetAt <= now) {
        rateLimitMap.delete(key)
      }
    }
  }, 300_000)
}

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1"
  return ip
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  let entry = rateLimitMap.get(key)
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    rateLimitMap.set(key, entry)
  }
  entry.count++
  return {
    allowed: entry.count <= RATE_LIMIT_MAX_REQUESTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count),
    resetAt: entry.resetAt,
  }
}

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()

  // Detect IPv6-mapped IPv4 (::ffff:x.x.x.x) — extract and re-check the IPv4 portion
  if (lower.startsWith("::ffff:")) {
    const mappedIpv4 = lower.substring(7)
    if (isPrivateHost(mappedIpv4)) return true
  }

  return PRIVATE_HOSTS.some((prefix) => lower === prefix || lower.startsWith(prefix))
}

function validateUrl(rawUrl: string): { valid: boolean; parsed?: URL; error?: string } {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "Missing or invalid URL" }
  }
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return { valid: false, error: "Missing or invalid URL" }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { valid: false, error: "Invalid URL format" }
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { valid: false, error: "Only HTTP and HTTPS protocols are allowed" }
  }

  if (!parsed.hostname) {
    return { valid: false, error: "URL must include a hostname" }
  }

  return { valid: true, parsed }
}

function structuredError(message: string, code: string, status: number): NextResponse {
  return NextResponse.json({ error: message, code }, { status })
}

function isFetchNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return /failed to fetch|networkerror|enotfound|econnrefused|econntreset|etimedout|socket hang up|connect.*refused/.test(message)
}

export async function POST(request: NextRequest) {
  // Declare these in outer scope so the catch block can reference them for
  // useful debug output when things fail.
  let parsedUrl: URL | undefined = undefined
  let targetUrl = ""
  let debugMode = false

  try {
    // ── Rate limiting ────────────────────────────────────────────────────
    const rateKey = getRateLimitKey(request)
    const rateResult = checkRateLimit(rateKey)
    if (!rateResult.allowed) {
      return structuredError(
        "Rate limit exceeded. Try again later.",
        "RATE_LIMIT_EXCEEDED",
        429,
      )
    }

    // ── Body size check ─────────────────────────────────────────────────
    const contentLength = request.headers.get("content-length")
    if (contentLength) {
      const size = parseInt(contentLength, 10)
      if (!isNaN(size) && size > MAX_BODY_SIZE) {
        return structuredError(
          "Request body exceeds the maximum allowed size of 10 MB",
          "BODY_TOO_LARGE",
          413,
        )
      }
    }

    // ── Parse body ───────────────────────────────────────────────────────
    let payload: Record<string, unknown>
    try {
      payload = await request.json()
    } catch {
      return structuredError(
        "Invalid JSON in request body",
        "INVALID_JSON",
        400,
      )
    }

    const rawUrl = typeof payload.url === "string" ? payload.url.trim() : ""
    const method = typeof payload.method === "string" ? payload.method.toUpperCase() : ""
    const headers = payload.headers && typeof payload.headers === "object" ? payload.headers : {}
    const payloadBody = payload.body

    if (!rawUrl) {
      return structuredError("Missing or invalid URL", "MISSING_URL", 400)
    }

    if (!ALLOWED_METHODS.includes(method)) {
      return structuredError(
        `Unsupported method: ${String(payload.method)}`,
        "UNSUPPORTED_METHOD",
        400,
      )
    }

    // ── Validate URL ─────────────────────────────────────────────────────
    const urlValidation = validateUrl(rawUrl)
    if (!urlValidation.valid) {
      return structuredError(urlValidation.error!, "INVALID_URL", 400)
    }
    // expose these to the outer scope so catch-blocks can reference them for debug
    parsedUrl = urlValidation.parsed!
    targetUrl = parsedUrl.href

    // ── Mock check — intercept BEFORE SSRF guard ─────────────────────────
    const pathname = parsedUrl.pathname

    // Determine workspace context (payload overrides header)
    const workspaceIdFromPayload = typeof payload.workspaceId === "string" ? String(payload.workspaceId) : undefined
    const workspaceIdFromHeader = request.headers.get("x-workspace-id") || undefined
    const workspaceId = workspaceIdFromPayload ?? workspaceIdFromHeader

    if (isMockEnabledForWorkspace(workspaceId)) {
      // Only consider routes for the active workspace when workspaceId is provided.
      // If no workspaceId is provided, only match routes without a workspace or the personal workspace.
      const activeRoutes = getMockRoutes().filter((r) => r.enabled && (workspaceId ? r.workspaceId === workspaceId : (!r.workspaceId || r.workspaceId === "ws-personal")))
      for (const route of activeRoutes) {
        const match = matchMockRoute(method, pathname, route.method, route.pathPattern)
        if (match.matched) {
          const delay = route.delay
          if (delay > 0) {
            await new Promise((r) => setTimeout(r, delay))
          }

          const responseHeaders: Record<string, string> = {
            "x-mock-route": route.id,
            "x-mock-name": route.name,
            "x-mock-delay": String(delay),
            ...route.responseHeaders,
          }

          return NextResponse.json({
            status: route.responseStatus,
            body: route.responseBody,
            headers: responseHeaders,
            encoding: "utf8",
            mocked: true,
          })
        }
      }
    }

    // ── SSRF protection ──────────────────────────────────────────────────
    if (isPrivateHost(parsedUrl.hostname)) {
      return structuredError(
        "Requests to private/internal hosts are not allowed",
        "SSRF_BLOCKED",
        403,
      )
    }

    // ── Prepare headers and body ─────────────────────────────────────────
    const finalHeaders: Record<string, string> = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, String(value)]),
    )

    // debug mode can be requested either via header `x-proxy-debug: 1` or via
    // a `debug: true` boolean in the JSON payload.
    debugMode = String(request.headers.get("x-proxy-debug") || "").trim() === "1"
    if (!debugMode && payload && typeof (payload as any).debug === "boolean") {
      debugMode = Boolean((payload as any).debug)
    }

    let bodyToSend: string | undefined
    if (method !== "GET" && payloadBody !== undefined && payloadBody !== null) {
      bodyToSend = typeof payloadBody === "string" ? payloadBody : JSON.stringify(payloadBody)
    }

    if (bodyToSend) {
      const hasContentType = Object.keys(finalHeaders).some(
        (key) => key.toLowerCase() === "content-type",
      )
      if (!hasContentType) {
        finalHeaders["Content-Type"] = "application/json"
      }
    }

    // ── Execute fetch with timeout ───────────────────────────────────────
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    const startTime = Date.now()
    const response = await fetch(targetUrl, {
      method,
      headers: finalHeaders,
      body: bodyToSend,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    const durationMs = Date.now() - startTime
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || ""
    const isBinary = /^(image\/|video\/|audio\/|application\/pdf|application\/octet-stream)/.test(contentType)
    let body: string
    let encoding = "utf8"
    let size = 0

    if (isBinary) {
      const arrayBuffer = await response.arrayBuffer()
      body = Buffer.from(arrayBuffer).toString("base64")
      encoding = "base64"
      size = arrayBuffer.byteLength
    } else {
      body = await response.text()
      size = new Blob([body]).size
    }

    const successPayload: Record<string, any> = {
      status: response.status,
      statusText: response.statusText,
      body,
      headers: responseHeaders,
      encoding,
      mocked: false,
      durationMs,
      size,
    }

    if (debugMode) {
      successPayload._debug = {
        requestedUrl: targetUrl,
        hostname: parsedUrl.hostname,
        isPrivateHost: isPrivateHost(parsedUrl.hostname),
      }
    }

    return NextResponse.json(successPayload)
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return structuredError("Request timed out after 30 seconds", "TIMEOUT", 504)
    }

    const message = error instanceof Error ? error.message : String(error)
    if (isFetchNetworkError(error)) {
      const resp = structuredError(message, "BAD_GATEWAY", 502)
      if (debugMode) {
        // attach debug info when requested
        return NextResponse.json({ ...(await resp.json()), _debug: { requestedUrl: targetUrl, hostname: parsedUrl?.hostname ?? null } }, { status: 502 })
      }
      return resp
    }

    const resp = structuredError(message, "INTERNAL_ERROR", 500)
    if (debugMode) {
      return NextResponse.json({ ...(await resp.json()), _debug: { requestedUrl: targetUrl, hostname: parsedUrl?.hostname ?? null } }, { status: 500 })
    }
    return resp
  }
}
