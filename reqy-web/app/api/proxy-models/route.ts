export const dynamic = "force-static";
import { NextRequest, NextResponse } from "next/server";
import { InMemoryRateLimiter } from "@/lib/rate-limiter";

const rateLimiter = new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 60 });

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1";
}

interface ModelEntry {
  id: string;
  name?: string;
  owned_by?: string;
}

async function fetchOpenAICompatible(
  baseUrl: string,
  apiKey: string,
): Promise<{ data: ModelEntry[] }> {
  const base = baseUrl?.trim() || "https://api.openai.com/v1";
  const url = `${base.replace(/\/+$/, "")}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { data: ModelEntry[] };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOpenRouterModels(apiKey: string): Promise<{ data: ModelEntry[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { data: ModelEntry[] };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGeminiModels(apiKey: string): Promise<{ data: ModelEntry[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      models?: Array<{
        name?: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const data: ModelEntry[] = (json.models ?? [])
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes("generateContent"),
      )
      .filter((m) => {
        const id = (m.name ?? "").replace(/^models\//, "");
        return id.length > 0;
      })
      .map((m) => {
        const id = (m.name ?? "").replace(/^models\//, "");
        return { id, name: m.displayName ?? id };
      });
    return { data };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOllamaModels(): Promise<{ data: ModelEntry[] }> {
  const host = "127.0.0.1";
  const port = "11434";
  const url = `http://${host}:${port}/api/tags`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { models?: Array<{ name: string }> };
    const data: ModelEntry[] = (json.models ?? [])
      .filter((m) => typeof m.name === "string")
      .map((m) => ({ id: m.name, name: m.name }));
    return { data };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOpenCodeZenModels(apiKey: string): Promise<{ data: ModelEntry[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://opencode.ai/zen/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { data: ModelEntry[] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  const rateKey = getRateLimitKey(req);
  const rateResult = await rateLimiter.check(rateKey);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" },
      { status: 429 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const body = rawBody as Record<string, unknown>;
  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";

  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 });
  }

  try {
    let result: { data: ModelEntry[] };

    switch (provider) {
      case "custom":
        if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 400 });
        result = await fetchOpenAICompatible(baseUrl || "https://api.openai.com/v1", apiKey);
        break;

      case "openrouter":
        if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 400 });
        result = await fetchOpenRouterModels(apiKey);
        break;

      case "gemini":
        if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 400 });
        result = await fetchGeminiModels(apiKey);
        break;

      case "openai": {
        if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 400 });
        const raw = await fetchOpenAICompatible(baseUrl || "https://api.openai.com/v1", apiKey);
        // Filter to gpt-* models for OpenAI
        result = {
          data: (raw.data ?? []).filter((m) => m.id.startsWith("gpt-")),
        };
        break;
      }

      case "ollama":
        result = await fetchOllamaModels();
        break;

      case "opencode-zen":
        if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 400 });
        result = await fetchOpenCodeZenModels(apiKey);
        break;

      default:
        return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ error: "Upstream request timed out" }, { status: 504 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 },
    );
  }
}
