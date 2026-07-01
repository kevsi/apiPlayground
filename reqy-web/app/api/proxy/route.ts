export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server"
import { getActiveMockRoutesForWorkspace, getMockServers, isMockEnabledForWorkspace } from "@/lib/mock-store"
import { resolveMockMatch, applyMockDelay, buildMockHeaders } from "@/lib/mock-resolver"
import { validateProxyPayload } from "@/lib/schemas/proxy"
import { WORKSPACE_NORMALIZER } from "@/lib/workspace-utils"
import { isBoolean, isHttpMethod } from "@/lib/type-guards"
import { InMemoryRateLimiter, UpstashRateLimiter, type DistributedRateLimiter, type RateLimitResult } from "@/lib/rate-limiter"
import { getServerEnv } from "@/lib/env"
import dns from "node:dns/promises"
import { isIP } from "node:net"

const MAX_BODY_SIZE = 10 * 1024 * 1024 // 10 MB

const PRIVATE_CIDRS_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],   // CGNAT (RFC 6598)
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],  // link-local
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],    // TEST-NET-1
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],   // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24],  // TEST-NET-3
  ["224.0.0.0", 4],     // multicast
  ["240.0.0.0", 4],     // reserved / broadcast
]

const PRIVATE_CIDRS_V6: Array<[string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],   // IPv4-mapped
  ["64:ff9b::", 96],    // NAT64
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["fc00::", 7],        // ULA
  ["fe80::", 10],       // link-local
]

function ipToBigInt(ip: string): bigint {
  const v = isIP(ip)
  if (v === 4) {
    const parts = ip.split(".").map(Number)
    const n =
      ((parts[0] << 24) >>> 0) +
      ((parts[1] << 16) >>> 0) +
      ((parts[2] << 8) >>> 0) +
      parts[3]
    return BigInt(n >>> 0)
  }
  const groups = ip.split(":")
  let head: number[] = []
  let tail: number[] = []
  let hasEmpty = false
  for (const g of groups) {
    if (g === "") {
      hasEmpty = true
    } else {
      (hasEmpty ? tail : head).push(parseInt(g, 16))
    }
  }
  const fill = 8 - head.length - tail.length
  const full = hasEmpty ? [...head, ...new Array(fill).fill(0), ...tail] : [...head, ...tail]
  let acc = BigInt(0)
  for (const g of full) acc = (acc << BigInt(16)) + BigInt(g)
  return acc
}

function ipInCidr(ip: string, cidr: [string, number]): boolean {
  const v = isIP(ip)
  const v6 = isIP(cidr[0])
  if (v !== v6) return false
  const ipN = ipToBigInt(ip)
  const netN = ipToBigInt(cidr[0])
  const bits = BigInt(v === 4 ? 32 - cidr[1] : 128 - cidr[1])
  if (bits === BigInt(0)) return ipN === netN
  return (ipN >> bits) === (netN >> bits)
}

function isBlockedIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) return PRIVATE_CIDRS_V4.some((c) => ipInCidr(ip, c))
  if (v === 6) {
    if (ip.toLowerCase().startsWith("::ffff:")) {
      const v4 = ip.substring(7)
      if (isIP(v4) === 4 && isBlockedIp(v4)) return true
    }
    return PRIVATE_CIDRS_V6.some((c) => ipInCidr(ip, c))
  }
  return true // unknown literal — fail-closed
}

const rateLimiter: DistributedRateLimiter = (() => {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRateLimiter({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
      windowMs: 60_000,
      maxRequests: 100,
    })
  }
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[proxy] UPSTASH_REDIS_REST_URL not set — falling back to in-memory rate limiter. " +
        "On serverless/Edge this is per-instance and effectively ineffective.",
    )
  }
  const inner = new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100 })
  return {
    async check(key: string): Promise<RateLimitResult> {
      return inner.check(key)
    },
  }
})()

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1"
  return ip
}

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === "localhost") return true
  // If hostname is itself an IP literal, test directly.
  if (isIP(lower)) return isBlockedIp(lower)
  // Otherwise: rely on DNS pre-resolution in the caller. Fail-closed here too.
  return true
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
  let hostOverride: string | undefined

  // ── Timing metrics ────────────────────────────────────────────────────
  const timings = { dnsMs: 0, connectMs: 0, ttfbMs: 0 }

  try {
    const rateKey = getRateLimitKey(request)
    const rateResult = await rateLimiter.check(rateKey)
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
    const env = getServerEnv()
    const allowLocal =
      process.env.NODE_ENV === "development" || env.ALLOW_LOCAL_HOSTS === "true"

    if (!allowLocal) {
      // 1) Reject bare IP literals that are themselves private.
      if (isIP(parsedUrl.hostname) && isBlockedIp(parsedUrl.hostname)) {
        return structuredError(
          "Requests to private/internal hosts are not allowed",
          "SSRF_BLOCKED",
          403,
        )
      }

      // 2) Resolve DNS once, check the resolved address, and PIN it in the
      //    outbound URL so DNS rebinding between check and fetch cannot
      //    redirect to a private IP.
      let resolvedIp: string
      try {
        const dnsStart = Date.now()
        const { address } = await dns.lookup(parsedUrl.hostname, { all: false })
        timings.dnsMs = Date.now() - dnsStart
        resolvedIp = address
      } catch {
        return structuredError("DNS resolution failed", "DNS_ERROR", 400)
      }

      if (isBlockedIp(resolvedIp)) {
        return structuredError(
          "Requests to private/internal hosts are not allowed (DNS rebinding prevention)",
          "SSRF_BLOCKED",
          403,
        )
      }

      // 3) Rewrite the target URL to use the literal IP, but keep the
      //    original `Host` header so virtualhosts / SNI still match.
      const portPart = parsedUrl.port ? `:${parsedUrl.port}` : ""
      const hostLiteral = isIP(resolvedIp) === 6 ? `[${resolvedIp}]` : resolvedIp
      targetUrl = `${parsedUrl.protocol}//${hostLiteral}${portPart}${parsedUrl.pathname}${parsedUrl.search}`
      // Capture the original Host to apply after `finalHeaders` is created.
      hostOverride = parsedUrl.host
    }

    // ── Prepare headers and body ─────────────────────────────────────────
    const finalHeaders: Record<string, string> = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, String(value)]),
    )

    const targetIsLocalMock = parsedUrl.origin === request.nextUrl.origin && parsedUrl.pathname.startsWith("/mock/")
    if (targetIsLocalMock && workspaceId) {
      finalHeaders["x-workspace-id"] = workspaceId
    }

    // SSRF protection: pin Host header to original hostname when IP was rewritten.
    if (hostOverride) {
      finalHeaders["Host"] = hostOverride
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

    const MAX_RESPONSE_BODY_SIZE = 5 * 1024 * 1024 // 5 MB
    const truncationSuffix = "\n\n...<Response truncated>"

    // Stream the response body and cancel as soon as the cap is reached,
    // so we don't waste memory buffering a multi-GB payload just to throw
    // 99% of it away.
    const reader = response.body?.getReader()
    if (!reader) {
      body = ""
      size = 0
    } else {
      const chunks: Uint8Array[] = []
      let received = 0
      let truncated = false
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue
          const remaining = MAX_RESPONSE_BODY_SIZE - received
          if (value.byteLength > remaining) {
            chunks.push(value.subarray(0, Math.max(0, remaining)))
            received += remaining
            truncated = true
            try { await reader.cancel() } catch { /* ignore */ }
            break
          }
          chunks.push(value)
          received += value.byteLength
        }
      } finally {
        // Ensure the reader lock is released even on error paths
        try { reader.releaseLock() } catch { /* ignore */ }
      }
      const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)))
      size = buf.byteLength
      if (isBinary) {
        body = buf.toString("base64")
        encoding = "base64"
      } else {
        let text = buf.toString("utf8")
        if (truncated) text += truncationSuffix
        body = text
      }
      if (truncated) {
        responseHeaders["x-proxy-truncated"] = "1"
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
