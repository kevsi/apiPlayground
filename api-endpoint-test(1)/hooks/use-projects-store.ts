"use client"

import { secureKeys } from "@/lib/secure-storage"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
export type AIProvider = "anthropic" | "openai" | "openrouter" | "gemini" | "deepseek" | "ollama"
export type AnalysisMode = "static" | "ai"

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

export interface SavedProject {
  id: string
  name: string
  framework: string
  language?: string
  folderPath: string
  port?: number
  routes: DetectedRoute[]
  analyzedAt: string
  mode: AnalysisMode
  workspaceId?: string
}

const API_KEYS_KEY = "probe_api_keys"
const AI_PROVIDER_KEY = "probe_ai_provider"
const AI_BASE_URL_KEY = "probe_ai_base_urls"
const AI_MODEL_KEY = "probe_ai_models"
const OLLAMA_CONFIG_KEY = "probe_ollama_config"
const GITHUB_CONFIG_KEY = "probe_github_config"

export interface GithubConfig {
  token?: string
}

export function loadApiKey(provider: AIProvider): string {
  return secureKeys.get(`${API_KEYS_KEY}_${provider}`) ?? ""
}

export function loadAiBaseUrl(provider: AIProvider): string {
  try {
    const raw = localStorage.getItem(AI_BASE_URL_KEY)
    if (!raw) return ""
    const urls = JSON.parse(raw) as Record<string, string>
    return urls[provider] ?? ""
  } catch {
    return ""
  }
}

export function saveAiBaseUrl(provider: AIProvider, url: string) {
  try {
    const raw = localStorage.getItem(AI_BASE_URL_KEY)
    const urls: Record<string, string> = raw ? JSON.parse(raw) : {}
    urls[provider] = url
    localStorage.setItem(AI_BASE_URL_KEY, JSON.stringify(urls))
  } catch {}
}

export function loadAiModel(provider: AIProvider): string {
  try {
    const raw = localStorage.getItem(AI_MODEL_KEY)
    if (!raw) return ""
    const models = JSON.parse(raw) as Record<string, string>
    return models[provider] ?? ""
  } catch {
    return ""
  }
}

export function saveAiModel(provider: AIProvider, model: string) {
  try {
    const raw = localStorage.getItem(AI_MODEL_KEY)
    const models: Record<string, string> = raw ? JSON.parse(raw) : {}
    models[provider] = model
    localStorage.setItem(AI_MODEL_KEY, JSON.stringify(models))
  } catch {}
}

export function saveApiKey(provider: AIProvider, key: string) {
  if (key) {
    secureKeys.set(`${API_KEYS_KEY}_${provider}`, key)
  } else {
    secureKeys.delete(`${API_KEYS_KEY}_${provider}`)
  }
}

export function loadAIProvider(): AIProvider {
  try {
    const raw = localStorage.getItem(AI_PROVIDER_KEY)
    if (!raw) return "openai"
    return raw as AIProvider
  } catch {
    return "openai"
  }
}

export function saveAIProvider(provider: AIProvider) {
  try {
    localStorage.setItem(AI_PROVIDER_KEY, provider)
  } catch {}
}

export interface OllamaConfig {
  host?: string
  port?: number
  model?: string
}

export function loadOllamaConfig(): OllamaConfig {
  try {
    const raw = localStorage.getItem(OLLAMA_CONFIG_KEY)
    return raw ? (JSON.parse(raw) as OllamaConfig) : {}
  } catch {
    return {}
  }
}

export function saveOllamaConfig(config: OllamaConfig) {
  try {
    localStorage.setItem(OLLAMA_CONFIG_KEY, JSON.stringify(config))
  } catch {}
}

export function loadGithubConfig(): GithubConfig {
  const token = secureKeys.get(GITHUB_CONFIG_KEY)
  return token ? { token } : {}
}

export function saveGithubConfig(config: GithubConfig) {
  if (config.token) {
    secureKeys.set(GITHUB_CONFIG_KEY, config.token)
  } else {
    secureKeys.delete(GITHUB_CONFIG_KEY)
  }
}
