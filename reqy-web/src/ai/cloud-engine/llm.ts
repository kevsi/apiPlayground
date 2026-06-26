/**
 * Phase 2.3 — LLM client (SSE streaming)
 *
 * Streams tokens from /api/proxy-ai for any configured provider.
 * - OpenAI-compatible (openai, openrouter, opencode-zen, deepseek): server
 *   returns text/event-stream, we parse chunks.
 * - Anthropic / Gemini / Ollama: server ignores stream flag; yields single JSON
 *   content token.
 */
import type { AIProvider, Diagnostic, RequestContext } from "@/src/ai/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/src/ai/cloud-engine/prompt";

export interface StreamLLMOptions {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  host?: string;
  port?: number | string;
  openaiUrl?: string;
  question: string;
  ctx: RequestContext;
  diagnostics?: Diagnostic[];
  signal?: AbortSignal;
}

export async function* streamLLM(
  opts: StreamLLMOptions
): AsyncIterable<string> {
  const userPrompt = buildUserPrompt(
    opts.question,
    opts.ctx,
    opts.diagnostics ?? []
  );

  const res = await fetch("/api/proxy-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: opts.provider,
      apiKey: opts.apiKey,
      model: opts.model,
      host: opts.host,
      port: opts.port,
      openaiUrl: opts.openaiUrl,
      system: SYSTEM_PROMPT,
      message: userPrompt,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let errMsg = `Proxy error ${res.status}`;
    try {
      const j: Record<string, unknown> = await res.json();
      errMsg =
        typeof j?.error === "string" ? j.error : errMsg;
    } catch {
      /* ignore non-JSON error body */
    }
    throw new Error(errMsg);
  }

  const contentType = res.headers.get("content-type") ?? "";

  // SSE path — OpenAI-compatible passthrough.
  if (contentType.includes("text/event-stream") && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json: any = JSON.parse(payload);
            const token: unknown =
              json?.choices?.[0]?.delta?.content;
            if (typeof token === "string" && token.length > 0) {
              yield token;
            }
          } catch {
            /* malformed line — skip */
          }
        }

        sep = buffer.indexOf("\n\n");
      }
    }
    return;
  }

  // JSON fallback (anthropic / gemini / ollama).
  const data: any = await res.json();
  if (typeof data?.error === "string") {
    throw new Error(data.error);
  }
  if (typeof data?.content === "string" && data.content.length > 0) {
    yield data.content;
  }
}
