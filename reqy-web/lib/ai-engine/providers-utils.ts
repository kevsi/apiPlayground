/**
 * AI engine — internal utilities for provider HTTP calls.
 *
 * Extracted from providers.ts to keep each file under 250 lines.
 * These are **not** part of the public API (not re-exported from index.ts).
 */

import { proxyAuthHeaders } from "@/lib/proxy-auth";
import type { AIProvider } from "./types";

const FETCH_TIMEOUT = 30000;

/**
 * Extracts a user-friendly error message from a failed /api/proxy-* response.
 * Distinguishes middleware auth failures (PROXY_AUTH_REQUIRED) from upstream
 * AI provider errors so the user sees actionable messages.
 */
export function extractProxyError(res: Response, bodyText: string, provider: string): string {
  let data: { error?: string; code?: string } = {};
  try {
    data = JSON.parse(bodyText);
  } catch {
    /* ignore parse errors */
  }

  if (data.code === "PROXY_AUTH_REQUIRED") {
    return `Authentification du proxy refusée. Vérifie que PROXY_SERVICE_TOKEN et NEXT_PUBLIC_PROXY_SERVICE_TOKEN sont identiques dans .env.local`;
  }

  if (data.error) {
    return `${provider}: ${data.error}`;
  }

  return `${provider}: Erreur HTTP ${res.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ""}`;
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number },
): Promise<Response> {
  const timeout = options.timeout ?? FETCH_TIMEOUT;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {};
  if (typeof options.headers === "object" && !Array.isArray(options.headers)) {
    Object.assign(headers, options.headers as Record<string, string>);
  }
  if (url.startsWith("/api/proxy")) {
    Object.assign(headers, proxyAuthHeaders());
  }

  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Provider groups that share the same proxy call shape.
 * - PROXY_API_KEY: anthropic, openai, custom, grok
 * - PROXY_API_KEY_EXTRA: openrouter, gemini, deepseek, opencode-zen
 * - DIRECT: ollama (calls its own /api/chat)
 */
export type ProviderGroup = "PROXY_API_KEY" | "PROXY_API_KEY_EXTRA" | "OLLAMA";

export function getProviderGroup(provider: AIProvider): ProviderGroup {
  switch (provider) {
    case "anthropic":
    case "openai":
    case "custom":
    case "grok":
      return "PROXY_API_KEY";
    case "openrouter":
    case "gemini":
    case "deepseek":
    case "opencode-zen":
      return "PROXY_API_KEY_EXTRA";
    case "ollama":
      return "OLLAMA";
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
