export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server"
import { isIP } from "node:net"
import { InMemoryRateLimiter } from "@/lib/rate-limiter"
import { isBlockedIp } from "@/lib/security/ssrf"

const rateLimiter = new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 30 })

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "127.0.0.1"
}

function structuredError(message: string, code: string, status: number): NextResponse {
  return NextResponse.json({ error: message, code }, { status })
}

type ProviderBody = {
  provider: string
  apiKey?: string
  model?: string
  system?: string
  message?: string
  stream?: boolean
}

interface OllamaBody extends ProviderBody {
  host?: string
  port?: string | number
}

type GeminiChunk = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }>; text?: string }; text?: string }>
  text?: string
}

// Phase 2.5: SSE streaming helper for OpenAI-compatible providers
function passthroughSSE(upstreamRes: Response): Response {
  if (!upstreamRes.body) {
    return new Response("Upstream returned no body", { status: 502 })
  }
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

function tryParseGeminiError(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return parsed.error?.message ?? parsed.error ?? raw
  } catch {
    return raw
  }
}

function getCustomUrl(body: Record<string, unknown>): string {
  const raw = typeof body.openaiUrl === "string" ? body.openaiUrl.trim() : ""
  if (!raw) {
    throw new Error("Custom provider requires a base URL")
  }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error("Invalid custom provider URL")
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("URL must use http or https")
  }
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "0.0.0.0" || isIP(parsed.hostname) && isBlockedIp(parsed.hostname)) {
    throw new Error("Custom provider URL cannot point to localhost or private IP")
  }
  return raw.replace(/\/+$/, "") + "/chat/completions"
}

export async function POST(req: NextRequest) {
  const rateKey = getRateLimitKey(req)
  const rateResult = await rateLimiter.check(rateKey)
  if (!rateResult.allowed) {
    return structuredError("Rate limit exceeded", "RATE_LIMIT_EXCEEDED", 429)
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return structuredError("Invalid JSON in request body", "INVALID_JSON", 400)
  }

  if (typeof rawBody !== "object" || rawBody === null) {
    return structuredError("Body must be a JSON object", "INVALID_PAYLOAD", 400)
  }

  const body = rawBody as Record<string, unknown>
  const provider = typeof body.provider === "string" ? body.provider.trim() : ""
  const message = typeof body.message === "string" ? body.message.trim() : ""
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
  const model = typeof body.model === "string" ? body.model.trim() : ""
  const system = typeof body.system === "string" ? body.system : ""
  const host = typeof body.host === "string" && body.host.trim() ? body.host.trim() : "127.0.0.1"
  const port = typeof body.port === "string"
    ? body.port.trim()
    : typeof body.port === "number"
    ? String(body.port)
    : ""
  const ollamaPort = port || process.env.OLLAMA_PORT || "11434"

  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 })
  }

  if (!message && provider !== "ollama") {
    return NextResponse.json({ error: "Missing message" }, { status: 400 })
  }

  const PROVIDERS_WITH_API_KEY = new Set(["openai", "openrouter", "anthropic", "gemini", "deepseek", "opencode-zen", "custom", "grok"])
  if (PROVIDERS_WITH_API_KEY.has(provider) && !apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    const abortableFetch = (url: string, init: RequestInit) =>
      fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout))

    if (provider === "anthropic") {
      const res = await abortableFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model || "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system,
          messages: [{ role: "user", content: message }],
        }),
      })
      const data: unknown = await res.json()
      if (!res.ok) {
        const err = data && typeof data === "object" ? (data as Record<string, unknown>).error : undefined
        return NextResponse.json({ error: typeof err === "string" ? err : (typeof err === "object" ? (err as Record<string, unknown>).message as string ?? "Anthropic error" : "Anthropic error") }, { status: res.status })
      }
      const contentData = data && typeof data === "object" ? (data as Record<string, unknown>).content : undefined
      const content = (Array.isArray(contentData) ? contentData : [])
        .filter((item: unknown): item is { type?: string; text?: string } =>
          typeof item === "object" && item !== null)
        .reduce((acc: string, item) => item.type === "text" ? acc + (item.text || "") : acc, "")
      return NextResponse.json({ content })
    }

    if (provider === "openai" || provider === "openrouter" || provider === "opencode-zen" || provider === "custom" || provider === "grok") {
      const url = provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : provider === "openrouter"
        ? "https://openrouter.ai/api/v1/chat/completions"
        : provider === "opencode-zen"
        ? "https://opencode.ai/zen/v1/chat/completions"
        : provider === "grok"
        ? "https://api.x.ai/v1/chat/completions"
        : provider === "custom"
        ? getCustomUrl(body)
        : "https://api.openai.com/v1/chat/completions"
      
      const res = await abortableFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || (provider === "openrouter"
            ? "openai/gpt-5.2"
            : provider === "opencode-zen"
              ? "gpt-5"
              : provider === "grok"
                ? "grok-2"
                : "gpt-4o-mini"),
          stream: Boolean(body.stream),
          messages: [
            { role: "system", content: system },
            { role: "user", content: message },
          ],
        }),
      })
      if (!res.ok) {
        const rawText = await res.text()
        let data: unknown
        try {
          data = JSON.parse(rawText)
        } catch {
          data = { error: rawText }
        }
        const err = data && typeof data === "object" ? (data as Record<string, unknown>).error : undefined
        return NextResponse.json({ error: typeof err === "string" ? err : (typeof err === "object" ? (err as Record<string, unknown>).message as string ?? `${provider} error` : `${provider} error`) }, { status: res.status })
      }
      // Phase 2.5: stream passthrough
      if (body.stream && res.body) return passthroughSSE(res)
      
      const rawText = await res.text()
      let data: unknown
      try {
        data = JSON.parse(rawText)
      } catch {
        data = {}
      }
      const choices = data && typeof data === "object" ? (data as Record<string, unknown>).choices : undefined
      const firstChoice = Array.isArray(choices) && choices.length > 0 ? choices[0] as Record<string, unknown> : undefined
      const msg = firstChoice?.message as Record<string, unknown> | undefined
      const firstText = firstChoice?.text
      return NextResponse.json({ content: typeof msg?.content === "string" ? msg.content : (typeof firstText === "string" ? firstText : "") })
    }

    if (provider === "deepseek") {
      const res = await abortableFetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "deepseek-chat",
          messages: [
            { role: "system", content: system },
            { role: "user", content: message },
          ],
        }),
      })
      if (!res.ok) {
        const rawText = await res.text()
        let data: unknown
        try {
          data = JSON.parse(rawText)
        } catch {
          data = { error: rawText }
        }
        const err = data && typeof data === "object" ? (data as Record<string, unknown>).error : undefined
        return NextResponse.json({ error: typeof err === "string" ? err : (typeof err === "object" ? (err as Record<string, unknown>).message as string ?? "DeepSeek error" : "DeepSeek error") }, { status: res.status })
      }
      // Phase 2.5: stream passthrough
      if (body.stream && res.body) return passthroughSSE(res)
      
      const rawText = await res.text()
      let data: unknown
      try {
        data = JSON.parse(rawText)
      } catch {
        data = {}
      }
      const choices = data && typeof data === "object" ? (data as Record<string, unknown>).choices : undefined
      const firstChoice = Array.isArray(choices) && choices.length > 0 ? choices[0] as Record<string, unknown> : undefined
      const msg = firstChoice?.message as Record<string, unknown> | undefined
      const firstText = firstChoice?.text
      return NextResponse.json({ content: typeof msg?.content === "string" ? msg.content : (typeof firstText === "string" ? firstText : "") })
    }

      if (provider === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent`
        const res = await abortableFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: message }] }],
          }),
        })

        const contentType = res.headers.get("content-type") || ""

        if (contentType.includes("text/event-stream")) {
          const rawText = await res.text()
          let combined = ""
          for (const line of rawText.split("\n")) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim()
              if (!jsonStr || jsonStr === "[DONE]") continue
              try {
                const chunk: GeminiChunk = JSON.parse(jsonStr)
                const text =
                  chunk.candidates?.[0]?.content?.parts?.[0]?.text ||
                  chunk.candidates?.[0]?.content?.text ||
                  chunk.text ||
                  ""
                combined += text
              } catch {
                // skip malformed chunks
              }
            }
          }
          if (!res.ok && !combined) {
            const errData = tryParseGeminiError(rawText)
            return NextResponse.json({ error: errData }, { status: res.status })
          }
          return NextResponse.json({ content: combined })
        }

        const rawText = await res.text()
        let data: Record<string, unknown>
        try {
          data = JSON.parse(rawText)
        } catch {
          data = {}
        }

        if (!res.ok) {
          const err = data.error
          const errMsg = typeof err === "string" ? err : (err && typeof err === "object" ? (err as Record<string, unknown>).message as string ?? tryParseGeminiError(rawText) : tryParseGeminiError(rawText) ?? "Gemini error")
          return NextResponse.json({ error: errMsg }, { status: res.status })
        }

        const promptFeedback = data.promptFeedback as Record<string, unknown> | undefined
        if (promptFeedback?.blockReason) {
          return NextResponse.json({
            content: "",
            blocked: true,
            reason: promptFeedback.blockReason,
          })
        }

        const candidates = data.candidates as Array<Record<string, unknown>> | undefined
        const firstCandidate = Array.isArray(candidates) && candidates.length > 0 ? candidates[0] : undefined
        const candidateContent = firstCandidate?.content as Record<string, unknown> | undefined
        const parts = candidateContent?.parts as Array<Record<string, unknown>> | undefined
        const firstPart = Array.isArray(parts) && parts.length > 0 ? parts[0] : undefined
        const content =
          firstPart?.text as string ??
          candidateContent?.text as string ??
          ""
        return NextResponse.json({ content })
      }

    if (provider === "ollama") {
      // SSRF protection: reject private IPs and validate hostname
      if (isIP(host) && isBlockedIp(host)) {
        return structuredError("Invalid host", "SSRF_BLOCKED", 403)
      }
      const res = await abortableFetch(`http://${host}:${ollamaPort}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "keep-alive" },
        redirect: "manual",
        body: JSON.stringify({
          model: model || "llama2",
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: message },
          ],
        }),
      })
      const data: unknown = await res.json()
      if (!res.ok) {
        const err = data && typeof data === "object" ? (data as Record<string, unknown>).error : undefined
        return NextResponse.json({ error: typeof err === "string" ? err : "Ollama error" }, { status: res.status })
      }
      const choices = data && typeof data === "object" ? (data as Record<string, unknown>).choices : undefined
      const firstChoice = Array.isArray(choices) && choices.length > 0 ? choices[0] as Record<string, unknown> : undefined
      const msg = firstChoice?.message as Record<string, unknown> | undefined
      const content = typeof msg?.content === "string" ? msg.content : ""
      return NextResponse.json({ content })
    }

    return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
