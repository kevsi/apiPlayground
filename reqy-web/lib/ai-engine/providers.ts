/**
 * AI engine — provider HTTP calls.
 *
 * `callAI` returns a parsed `AIResponse` (actionable JSON the UI can dispatch).
 * `callAIText` returns the raw text content for callers that want to consume
 * the model output directly (e.g. GraphQL query generators).
 *
 * All providers share `fetchWithTimeout`, which:
 *   - Aborts after `FETCH_TIMEOUT`
 *   - Auto-injects proxy auth headers for internal `/api/proxy-*` routes
 */

import { DEFAULT_MODELS } from "@/lib/ai-config";
import { proxyAuthHeaders } from "@/lib/proxy-auth";
import { SYSTEM_PROMPT } from "./prompts";
import { parseAIResponse } from "./parser";
import type { AIProvider, AIResponse } from "./types";

const FETCH_TIMEOUT = 30000;

/**
 * Extracts a user-friendly error message from a failed /api/proxy-* response.
 * Distinguishes middleware auth failures (PROXY_AUTH_REQUIRED) from upstream
 * AI provider errors so the user sees actionable messages.
 */
function extractProxyError(res: Response, bodyText: string, provider: string): string {
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

async function fetchWithTimeout(
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
type ProviderGroup = "PROXY_API_KEY" | "PROXY_API_KEY_EXTRA" | "OLLAMA";

function getProviderGroup(provider: AIProvider): ProviderGroup {
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

/**
 * Internal shared implementation for proxy-based providers.
 */
async function callProxyProvider(
  provider: AIProvider,
  userPrompt: string,
  system: string,
  model: string,
  apiKey: string,
  openaiUrl?: string,
): Promise<AIResponse> {
  const group = getProviderGroup(provider);
  const extra =
    group === "PROXY_API_KEY" &&
    (provider === "openai" || provider === "custom" || provider === "grok") &&
    openaiUrl
      ? { openaiUrl }
      : {};

  const res = await fetchWithTimeout("/api/proxy-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      apiKey,
      model,
      system,
      message: userPrompt,
      ...extra,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractProxyError(res, text, provider));
  }

  const data = await res.json();
  const content = typeof data.content === "string" ? data.content : JSON.stringify(data);
  return parseAIResponse(String(content));
}

/**
 * Ollama provider — talks to a local server directly (no proxy).
 */
async function callOllamaProvider(
  userPrompt: string,
  system: string,
  model: string,
  ollamaUrl?: string,
): Promise<AIResponse> {
  const url = ollamaUrl ?? "http://localhost:11434";
  const res = await fetchWithTimeout(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Connection: "keep-alive" },
    body: JSON.stringify({
      model: model ?? "llama3",
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content =
    data && data.message && data.message.content ? data.message.content : JSON.stringify(data);
  return parseAIResponse(String(content));
}

/**
 * callAI: calls the selected AI provider and returns parsed AIResponse.
 */
export async function callAI(
  userPrompt: string,
  config: {
    provider: AIProvider;
    apiKey?: string;
    model?: string;
    openaiUrl?: string;
    ollamaUrl?: string;
    system?: string; // optional override for SYSTEM_PROMPT
  },
): Promise<AIResponse> {
  const provider = config.provider;
  const model = config.model || DEFAULT_MODELS[provider] || "gpt-4o-mini";
  const systemPrompt = config.system ?? SYSTEM_PROMPT;

  try {
    const group = getProviderGroup(provider);
    if (group === "OLLAMA") {
      return await callOllamaProvider(userPrompt, systemPrompt, model, config.ollamaUrl);
    }
    if (!config.apiKey) throw new Error(`${provider} requires apiKey in config`);
    return await callProxyProvider(
      provider,
      userPrompt,
      systemPrompt,
      model,
      config.apiKey,
      config.openaiUrl,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      summary: "AI call failed.",
      actions: [
        {
          type: "EXPLAIN",
          payload: { message: `AI call failed: ${message}` },
        },
      ],
    };
  }
}

/**
 * callAIText: returns raw model text instead of parsed actions.
 */
export async function callAIText(
  userPrompt: string,
  config: {
    provider: AIProvider;
    apiKey?: string;
    model?: string;
    openaiUrl?: string;
    ollamaUrl?: string;
    system?: string;
  },
): Promise<string> {
  const provider = config.provider;
  const model = config.model || DEFAULT_MODELS[provider] || "gpt-4o-mini";
  const system = config.system ?? SYSTEM_PROMPT;

  if (provider === "ollama") {
    const url = config.ollamaUrl ?? "http://localhost:11434";
    const res = await fetchWithTimeout(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Connection: "keep-alive" },
      body: JSON.stringify({
        model: model ?? "llama3",
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    return data && data.message && data.message.content
      ? String(data.message.content)
      : JSON.stringify(data);
  }

  if (!config.apiKey) throw new Error(`${provider} requires apiKey in config`);
  const group = getProviderGroup(provider);
  const extra =
    group === "PROXY_API_KEY" &&
    (provider === "openai" || provider === "custom" || provider === "grok") &&
    config.openaiUrl
      ? { openaiUrl: config.openaiUrl }
      : {};

  const res = await fetchWithTimeout("/api/proxy-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      apiKey: config.apiKey,
      model,
      system,
      message: userPrompt,
      ...extra,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractProxyError(res, text, provider));
  }

  const data = await res.json();
  return typeof data.content === "string" ? String(data.content) : JSON.stringify(data);
}
