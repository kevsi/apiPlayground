import {
  loadAIProvider,
  loadApiKey,
  loadOllamaConfig,
  type AIProvider,
} from "@/hooks/use-projects-store"
import type { AiProxyPayload } from "@/lib/ai-request-generator"

const MODEL_MAP: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-3.5-turbo",
  openrouter: "openai/gpt-5.2",
  gemini: "gemini-2.0-flash",
  deepseek: "deepseek-chat",
  ollama: "llama2",
}

export function isAiConfigured(): boolean {
  const provider = loadAIProvider()
  if (provider === "ollama") return true
  return loadApiKey(provider).trim().length > 0
}

export function buildAiProxyPayload(
  system: string,
  message: string,
): AiProxyPayload | null {
  const provider = loadAIProvider()
  const apiKey = loadApiKey(provider)
  if (provider !== "ollama" && !apiKey.trim()) return null

  const ollama = loadOllamaConfig()
  return {
    provider,
    apiKey,
    model: provider === "ollama" ? ollama.model || MODEL_MAP.ollama : MODEL_MAP[provider],
    host: ollama.host,
    port: ollama.port,
    system,
    message,
  }
}
