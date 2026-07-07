export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server"
import { InMemoryRateLimiter } from "@/lib/rate-limiter"

const rateLimiter = new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 30 })

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "127.0.0.1"
}

export async function POST(req: NextRequest) {
  const rateKey = getRateLimitKey(req)
  const rateResult = await rateLimiter.check(rateKey)
  if (!rateResult.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" }, { status: 429 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 })
  }

  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 })
  }

  const body = rawBody as Record<string, unknown>
  const provider = typeof body.provider === "string" ? body.provider.trim() : ""
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""

  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 })
  }

  try {
    if (provider === "opencode-zen") {
      if (!apiKey) {
        return NextResponse.json({ error: "Missing API key" }, { status: 400 })
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const res = await fetch("https://opencode.ai/zen/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))

      if (!res.ok) {
        return NextResponse.json({ error: `Upstream returned HTTP ${res.status}` }, { status: res.status })
      }

      const data: unknown = await res.json()
      return NextResponse.json(data ?? {})
    }

    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ error: "Upstream request timed out" }, { status: 504 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 })
  }
}
