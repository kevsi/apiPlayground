/**
 * Phase 2.4 — Prompt Builder
 * Builds LLM prompts from a RequestContext + user question.
 * Keeps the system prompt static (ReqlyAI persona) and combines the
 * serialized request/response/diagnostics with the question.
 */
import type { RequestContext, Diagnostic } from "@/src/ai/types";

export const SYSTEM_PROMPT = `Tu es ReqlyAI, un assistant API spécialisé.
Tu aides les développeurs à diagnostiquer des erreurs HTTP, comprendre des réponses,
et améliorer leurs requêtes. Tu réponds en français, de façon concise et actionnable.
Quand tu suggères un fix, donne le code exact prêt à coller.`;

const MAX_BODY_CHARS = 2000;

function truncate(value: unknown): string {
  if (value == null) return "(empty)";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s.length <= MAX_BODY_CHARS) return s;
  return s.slice(0, MAX_BODY_CHARS) + `…(truncated ${s.length - MAX_BODY_CHARS} chars)`;
}

export function buildContextSummary(ctx: RequestContext): string {
  const r = ctx.request;
  const lines: string[] = [];
  lines.push(`Requête : ${r.method} ${r.url}`);
  if (Object.keys(r.headers).length > 0) {
    lines.push(`Headers : ${JSON.stringify(r.headers, null, 2)}`);
  }
  if (r.body != null) {
    lines.push(`Body : ${truncate(r.body)}`);
  }
  if (ctx.response) {
    const res = ctx.response;
    lines.push(`Réponse : ${res.status} ${res.statusText} (${res.duration}ms, ${res.size} bytes)`);
    if (Object.keys(res.headers).length > 0) {
      lines.push(`Response headers : ${JSON.stringify(res.headers, null, 2)}`);
    }
    lines.push(`Response body : ${truncate(res.body)}`);
  }
  if (ctx.error) {
    lines.push(`Erreur réseau : ${ctx.error.code} — ${ctx.error.message}`);
  }
  return lines.join("\n");
}

export function buildUserPrompt(
  question: string,
  ctx: RequestContext,
  diagnostics: Diagnostic[] = []
): string {
  const parts: string[] = [];
  parts.push("=== Contexte de la requête ===");
  parts.push(buildContextSummary(ctx));
  if (diagnostics.length > 0) {
    parts.push("");
    parts.push("=== Diagnostics locaux ReqlyAI ===");
    for (const d of diagnostics) {
      parts.push(
        `- [${d.severity.toUpperCase()}] ${d.title}: ${d.explanation}` +
          (d.fix ? ` (fix: ${d.fix.description})` : "")
      );
    }
  }
  parts.push("");
  parts.push("=== Question ===");
  parts.push(question);
  return parts.join("\n");
}
