import { NextRequest, NextResponse } from "next/server"
import { getActiveMockRoutesForWorkspace, getMockServers, isMockEnabledForWorkspace } from "@/app/api/mock/config/route"
import { resolveMockMatch, applyMockDelay, buildMockHeaders } from "@/lib/mock-resolver"
import { validateProxyPayload } from "@/lib/schemas/proxy"
import { WORKSPACE_NORMALIZER } from "@/lib/workspace-utils"
import { isBoolean, isHttpMethod } from "@/lib/type-guards"
import { InMemoryRateLimiter } from "@/lib/rate-limiter"
import dns from "node:dns/promises"

const MAX_BODY_SIZE = 10 * 1024 * 1024 // 10 MB

const PRIVATE_HOSTS = [
  "127.0.0.1", "127.", "::1", "localhost",
  "0.0.0.0", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
  "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
  "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
  "192.168.", "169.254.",
]

const rateLimiter = new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100 })

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1"
  return ip
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

function isRouteServerEnabled(route: { serverId?: string }): boolean {
  if (!route.serverId) return true
  return getMockServers().some((server) => server.id === route.serverId && server.enabled)
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
  let workspaceId: string | undefined

  // ── Timing metrics ────────────────────────────────────────────────────
  const timings = { dnsMs: 0, connectMs: 0, ttfbMs: 0 }

  try {
    const rateKey = getRateLimitKey(request)
    const rateResult = rateLimiter.check(rateKey)
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

    // Validate payload against schema
    const validPayload = validateProxyPayload(payload)
    if (!validPayload) {
      return structuredError(
        "Invalid request payload. Check URL, method, and headers.",
        "INVALID_PAYLOAD",
        400,
      )
    }

    const rawUrl = validPayload.url
    const method = validPayload.method.toUpperCase() as typeof validPayload.method
    const headers = validPayload.headers || {}
    const payloadBody = validPayload.body
    debugMode = validPayload.debug || String(request.headers.get("x-proxy-debug") || "").trim() === "1"

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

    // Determine workspace context (payload overrides header) using centralized normalizer
    const workspaceIdFromPayload = validPayload.workspaceId
    const workspaceIdFromHeader = request.headers.get("x-workspace-id")
    workspaceId = WORKSPACE_NORMALIZER.normalize(workspaceIdFromPayload ?? workspaceIdFromHeader ?? undefined)

    if (isMockEnabledForWorkspace(workspaceId)) {
      const activeRoutes = getActiveMockRoutesForWorkspace(workspaceId).filter(isRouteServerEnabled)
      const requestQuery = Object.fromEntries(parsedUrl.searchParams.entries())
      const resolved = resolveMockMatch(activeRoutes, {
        method,
        pathname,
        query: requestQuery,
        headers,
      })

      if (resolved) {
        if (resolved.rateLimited) {
          return NextResponse.json(JSON.parse(resolved.body), {
            status: 429,
            headers: buildMockHeaders(resolved.route, resolved.headers, 0, {
              rateLimited: true,
              retryAfterSeconds: resolved.route.rateLimit?.windowSeconds,
              debug: `proxy|rate-limited|workspace:${resolved.route.workspaceId || "ws-personal"}|pathname:${pathname}`,
            }),
          })
        }

        await applyMockDelay(resolved.delay)

        const responseHeaders = buildMockHeaders(resolved.route, resolved.headers, resolved.delay, {
          debug: `proxy|matched|workspace:${resolved.route.workspaceId || "ws-personal"}|pathname:${pathname}|pattern:${resolved.route.pathPattern}`,
          variantId: resolved.variantId,
          variantName: resolved.variantName,
        })

        return NextResponse.json({
          status: resolved.status,
          body: resolved.body,
          headers: responseHeaders,
          encoding: "utf8",
          mocked: true,
        })
      }
    }

    // ── SSRF protection ──────────────────────────────────────────────────
    // Allow local testing in development mode or if explicitly enabled
    const allowLocal = process.env.NODE_ENV === "development" || process.env.ALLOW_LOCAL_HOSTS === "true"

    if (!allowLocal) {
      if (isPrivateHost(parsedUrl.hostname)) {
        return structuredError(
          "Requests to private/internal hosts are not allowed",
          "SSRF_BLOCKED",
          403,
        )
      }

      try {
        const dnsStart = Date.now()
        const lookupResult = await dns.lookup(parsedUrl.hostname)
        timings.dnsMs = Date.now() - dnsStart
        if (isPrivateHost(lookupResult.address)) {
           return structuredError(
            "Requests to private/internal hosts are not allowed (DNS Rebinding prevention)",
            "SSRF_BLOCKED",
            403,
          )
        }
      } catch (e) {
        return structuredError("DNS resolution failed", "DNS_ERROR", 400)
      }
    }

    // ── Prepare headers and body ─────────────────────────────────────────
    const finalHeaders: Record<string, string> = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, String(value)]),
    )

    const targetIsLocalMock = parsedUrl.origin === request.nextUrl.origin && parsedUrl.pathname.startsWith("/mock/")
    if (targetIsLocalMock && workspaceId) {
      finalHeaders["x-workspace-id"] = workspaceId
    }

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
    const customTimeoutMs = parseInt(request.headers.get("x-proxy-timeout") || "30000", 10)
    const finalTimeoutMs = Math.min(Math.max(customTimeoutMs, 1000), 120000)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), finalTimeoutMs)

    const startTime = Date.now()
    const response = await fetch(targetUrl, {
      method,
      headers: finalHeaders,
      body: bodyToSend,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    // TTFB approximation: time from request start until response headers
    // were received. fetch resolves when headers arrive, which for non-
    // streaming responses is essentially time-to-first-byte.
    // We deliberately do NOT read the body stream here because doing so
    // would corrupt it: subsequent response.text()/arrayBuffer() would
    // miss the consumed chunk, truncating the response body.
    timings.ttfbMs = Math.max(0, Date.now() - startTime)

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

    const MAX_RESPONSE_BODY_SIZE = 5 * 1024 * 1024; // 5 MB

    if (isBinary) {
      const arrayBuffer = await response.arrayBuffer()
      size = arrayBuffer.byteLength
      if (size > MAX_RESPONSE_BODY_SIZE) {
        body = "<Response too large to display>";
        encoding = "utf8";
      } else {
        body = Buffer.from(arrayBuffer).toString("base64")
        encoding = "base64"
      }
    } else {
      const textBody = await response.text()
      size = new Blob([textBody]).size
      if (size > MAX_RESPONSE_BODY_SIZE) {
         body = textBody.substring(0, MAX_RESPONSE_BODY_SIZE) + "\n\n...<Response truncated>";
      } else {
         body = textBody;
      }
    }

    const successPayload: Record<string, unknown> = {
      status: response.status,
      statusText: response.statusText,
      body,
      headers: responseHeaders,
      encoding,
      mocked: false,
      durationMs,
      size,
      timings,
    }

    if (debugMode) {
      successPayload._debug = {
        requestedUrl: targetUrl,
        hostname: parsedUrl.hostname,
        isPrivateHost: isPrivateHost(parsedUrl.hostname),
        workspaceId,
      }
    }

    return NextResponse.json(successPayload)
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return structuredError("Request timed out", "TIMEOUT", 504)
    }

    const message = error instanceof Error ? error.message : String(error)
    if (isFetchNetworkError(error)) {
      const resp = structuredError(message, "BAD_GATEWAY", 502)
      if (debugMode) {
        // attach debug info when requested
        return NextResponse.json({ ...(await resp.json()), _debug: { requestedUrl: targetUrl, hostname: parsedUrl?.hostname ?? null, workspaceId } }, { status: 502 })
      }
      return resp
    }

    const resp = structuredError(message, "INTERNAL_ERROR", 500)
    if (debugMode) {
      return NextResponse.json({ ...(await resp.json()), _debug: { requestedUrl: targetUrl, hostname: parsedUrl?.hostname ?? null, workspaceId } }, { status: 500 })
    }
    return resp
  }
}
