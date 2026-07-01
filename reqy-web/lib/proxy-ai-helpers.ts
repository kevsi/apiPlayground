/**
 * Pure helper functions for the AI proxy route.
 * Extracted here so they can be unit-tested without NextRequest/NextResponse.
 */

export interface ProviderBody {
  provider: string
  apiKey?: string
  model?: string
  openaiUrl?: string
  host?: string
  port?: string
  system?: string
  message?: string
}

/** Shape shared by OpenAI, OpenRouter, DeepSeek and Ollama (v1 compat). */
export interface OpenAIStyleResponse {
  choices?: Array<{
    message?: { content?: string }
    text?: string
  }>
  error?: { message?: string }
}

export function parseBody(raw: unknown): ProviderBody | null {
  if (typeof raw !== "object" || raw === null) return null
  const b = raw as Record<string, unknown>
  const provider = typeof b.provider === "string" ? b.provider.trim() : ""
  if (!provider) return null
  return {
    provider,
    apiKey: typeof b.apiKey === "string" ? b.apiKey.trim() : undefined,
    model: typeof b.model === "string" ? b.model.trim() : undefined,
    openaiUrl: typeof b.openaiUrl === "string" ? b.openaiUrl.trim() : undefined,
    host: typeof b.host === "string" && b.host.trim() ? b.host.trim() : undefined,
    port: typeof b.port === "string" ? b.port.trim() : typeof b.port === "number" ? String(b.port) : undefined,
    system: typeof b.system === "string" ? b.system : undefined,
    message: typeof b.message === "string" ? b.message.trim() : undefined,
  }
}

export function openAIStyleContent(data: OpenAIStyleResponse): string {
  return data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? ""
}

export function tryParseGeminiError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } }
    return parsed.error?.message ?? raw
  } catch {
    return raw
  }
}
