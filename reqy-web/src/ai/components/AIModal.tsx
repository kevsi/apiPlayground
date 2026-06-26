"use client";

/**
 * Phase 2.7+ — AI Modal (unified AI panel for the response area)
 *
 * Single-button entry point that opens a modal with page-dedicated AI
 * features. Tabs: Analyse | Debug | Tests | Explain | Generate | Optimize.
 *
 * Replaces the previous multi-tab AI layout (Chat + ReqlyAI).
 */
import { useMemo, useState } from "react";
import {
  Bot,
  Loader2,
  Sparkles,
  Clipboard,
  FileText,
  FlaskConical,
  Lightbulb,
  Wrench,
  BookOpen,
  Bug,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { analyze } from "@/src/ai/local-engine/analyzer";
import { buildRequestContext } from "@/src/ai/local-engine/context";
import { buildTestSuggestionsPrompt, isValidSuggestion } from "@/src/ai/cloud-engine/test-suggestions";
import {
  decodeJwt,
  explainHeader,
  annotateJson,
  summarizeAnnotated,
} from "@/src/ai/cloud-engine/explain";
import { buildNaturalLanguagePrompt } from "@/src/ai/cloud-engine/generate";
import { streamLLM, type StreamLLMOptions } from "@/src/ai/cloud-engine/llm";
import { extractCitations } from "@/src/ai/cloud-engine/citations";
import { detectLanguage } from "@/src/ai/cloud-engine/language";
import { cn } from "@/lib/utils";

type AiTab = "analyse" | "debug" | "tests" | "explain" | "generate" | "optimize";

export interface AIModalContext {
  method: string;
  url: string;
  requestHeaders?: Array<{ key: string; value: string }>;
  requestBody?: string;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  authToken?: string;
}

interface AIModalProps extends AIModalContext {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TABS: Array<{ id: AiTab; label: string; icon: typeof Sparkles }> = [
  { id: "analyse", label: "Analyse", icon: Sparkles },
  { id: "debug", label: "Debug", icon: Bug },
  { id: "tests", label: "Tests", icon: FlaskConical },
  { id: "explain", label: "Explain", icon: FileText },
  { id: "generate", label: "Generate", icon: BookOpen },
  { id: "optimize", label: "Optimize", icon: Wrench },
];

export function AIModal(props: AIModalProps) {
  const [activeTab, setActiveTab] = useState<AiTab>("analyse");
  const [userPrompt, setUserPrompt] = useState("");
  const [llmOutput, setLlmOutput] = useState("");
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Build the RequestContext once per modal render
  const ctx = useMemo(() => {
    const headerRecord: Record<string, string> = {};
    for (const h of props.requestHeaders ?? []) {
      if (h.key) headerRecord[h.key] = h.value;
    }
    return buildRequestContext(
      {
        method: props.method as any,
        url: props.url ?? "",
        headers: headerRecord,
        body: props.requestBody ?? null,
        authType: "none",
      },
      props.responseStatus !== undefined
        ? {
            status: props.responseStatus,
            statusText: "",
            headers: props.responseHeaders ?? {},
            body: props.responseBody,
            duration: 0,
            size: 0,
          }
        : undefined
    );
  }, [
    props.method,
    props.url,
    props.requestHeaders,
    props.requestBody,
    props.responseStatus,
    props.responseHeaders,
    props.responseBody,
  ]);

  const diagnostics = useMemo(() => analyze(ctx), [ctx]);

  const prompt = useMemo(() => {
    switch (activeTab) {
      case "analyse":
        return `Analyse cette requête/réponse HTTP et liste les problèmes potentiels.\n\nMéthode: ${props.method}\nURL: ${props.url}\nStatus: ${props.responseStatus ?? "inconnu"}\n\nRéponse (extrait):\n${(props.responseBody ?? "").slice(0, 1000)}`;
      case "debug":
        return `Debug cette réponse HTTP. Si le status indique une erreur (4xx/5xx), explique la cause probable et propose un fix concret.\n\n${props.method} ${props.url}\nStatus: ${props.responseStatus}\n\nBody:\n${(props.responseBody ?? "").slice(0, 2000)}`;
      case "tests":
        return buildTestSuggestionsPrompt({
          method: props.method,
          url: props.url,
          headers: props.responseHeaders,
          body: props.requestBody,
          lastStatus: props.responseStatus,
        });
      case "explain":
        return `Explique les headers et le body de cette réponse de manière pédagogique. Si le body contient du JSON, annote la structure. Si un header Authorization est présent, décode le JWT.\n\n${props.method} ${props.url}\nStatus: ${props.responseStatus}\n\nHeaders: ${JSON.stringify(props.responseHeaders ?? {}, null, 2)}\n\nBody (extrait):\n${(props.responseBody ?? "").slice(0, 2000)}`;
      case "generate":
        return buildNaturalLanguagePrompt(
          userPrompt || "Décris la requête ci-dessus et propose des tests additionnels",
          {}
        );
      case "optimize":
        return `Analyse cette requête/réponse et propose des optimisations concrètes : cache, pagination, compression, retry logic, etc.\n\n${props.method} ${props.url}\nStatus: ${props.responseStatus} (${ctx.response?.duration ?? 0}ms)\n\nHeaders de réponse: ${JSON.stringify(props.responseHeaders ?? {}, null, 2).slice(0, 800)}`;
      default:
        return "";
    }
  }, [activeTab, userPrompt, props, ctx]);

  const citations = useMemo(() => {
    if (props.responseStatus && props.responseStatus >= 400) return [];
    return extractCitations([
      {
        source: "request-context",
        content: `${props.method} ${props.url}\n${(props.responseBody ?? "").slice(0, 500)}`,
        metadata: { source: "current-request" },
        score: 1,
      },
    ]);
  }, [props.method, props.url, props.responseBody, props.responseStatus]);

  const lang = useMemo(() => detectLanguage(prompt), [prompt]);
  const langDirective = lang === "en" ? "\n\nRespond in English." : "";

  async function handleRunLLM() {
    if (!prompt) return;
    setLlmLoading(true);
    setLlmError(null);
    setLlmOutput("");
    try {
      // Provider config from localStorage (mirror use-ai-engine pattern)
      const provider = (typeof window !== "undefined" && (localStorage.getItem("ai-provider") as any)) || "openai";
      const apiKey = (typeof window !== "undefined" && localStorage.getItem(`ai-key-${provider}`)) || "";
      if (provider !== "ollama" && !apiKey) {
        setLlmError("Aucune clé API configurée. Va dans Settings → AI pour ajouter ta clé.");
        setLlmLoading(false);
        return;
      }

      const streamOpts: StreamLLMOptions = {
        provider: provider as any,
        apiKey: apiKey || "",
        question: userPrompt || prompt,
        ctx,
        diagnostics,
        signal: undefined,
      };

      let acc = "";
      const stream = streamLLM(streamOpts);
      for await (const token of stream) {
        acc += token;
        setLlmOutput(acc);
      }
    } catch (e: any) {
      setLlmError(e?.message ?? "Erreur inconnue");
    } finally {
      setLlmLoading(false);
    }
  }

  function handleCopy() {
    if (!prompt) return;
    navigator.clipboard?.writeText(prompt + langDirective);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Local-only tabs (no LLM needed)
  const localOnly = activeTab === "analyse" || activeTab === "explain";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            ReqlyAI · Assistant
          </DialogTitle>
          <DialogDescription>
            {props.method} {props.url || "(pas d'URL)"} · Status {props.responseStatus ?? "—"}
          </DialogDescription>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTab(t.id);
                  setLlmOutput("");
                  setLlmError(null);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-all",
                  active
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-testid={`ai-tab-${t.id}`}
              >
                <Icon className="size-3" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="min-h-[260px] max-h-[420px] overflow-y-auto p-1">
          {activeTab === "analyse" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Diagnostic local déterministe (P95 &lt; 50ms, zéro réseau).
              </p>
              {diagnostics.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm text-emerald-700">
                  <CheckCircle2 className="size-4" />
                  Aucun problème détecté — tout semble nominal.
                </div>
              ) : (
                diagnostics.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-lg border border-border bg-card p-3 space-y-1"
                    data-testid={`ai-diagnostic-${d.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                          d.severity === "error" && "bg-red-500/20 text-red-700",
                          d.severity === "warning" && "bg-amber-500/20 text-amber-700",
                          d.severity === "info" && "bg-blue-500/20 text-blue-700"
                        )}
                      >
                        {d.severity}
                      </span>
                      <span className="text-sm font-semibold">{d.title}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                        {d.id}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{d.explanation}</p>
                    {d.fix && (
                      <p className="text-xs">
                        <span className="font-semibold">Fix: </span>
                        {d.fix.description}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "explain" && (
            <ExplainTab
              responseHeaders={props.responseHeaders}
              responseBody={props.responseBody}
              authHeader={Object.entries(props.responseHeaders ?? {}).find(
                ([k]) => k.toLowerCase() === "authorization"
              )}
            />
          )}

          {activeTab === "generate" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Décris la requête à générer — l'IA crée un prompt optimisé (tu peux le copier vers ChatGPT, Claude, etc.).
              </p>
              <Textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Ex : crée un endpoint POST pour ajouter un utilisateur avec email et nom"
                rows={4}
                className="resize-none text-sm"
                data-testid="ai-generate-input"
              />
            </div>
          )}

          {(activeTab === "debug" ||
            activeTab === "tests" ||
            activeTab === "optimize" ||
            (activeTab === "generate" && userPrompt)) && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {activeTab === "tests"
                  ? "Prompt pour générer des assertions de test (nominal / erreur / edge cases)."
                  : activeTab === "debug"
                    ? "Prompt pour débugger la réponse (causes probables + fix concret)."
                    : activeTab === "optimize"
                      ? "Prompt pour optimiser (cache, retry, compression, pagination)."
                      : "Prompt pour générer une requête depuis ta description."}
              </p>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRunLLM}
                disabled={llmLoading}
                data-testid="ai-run-llm"
              >
                {llmLoading ? (
                  <>
                    <Loader2 className="size-3 mr-1 animate-spin" />
                    Génération...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3 mr-1" />
                    Lancer le LLM
                  </>
                )}
              </Button>

              {llmError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2 text-xs text-red-600">
                  {llmError}
                </div>
              )}

              {llmOutput && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {llmOutput}
                </div>
              )}
            </div>
          )}

          {/* Citations (shown for all tabs if available) */}
          {citations.length > 0 && activeTab !== "analyse" && (
            <div className="mt-3 border-t border-border pt-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Sources
              </p>
              <div className="flex flex-wrap gap-1.5">
                {citations.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!prompt}
            data-testid="ai-copy-prompt"
          >
            <Clipboard className="size-3.5 mr-1" />
            {copied ? "Copié !" : "Copier le prompt"}
          </Button>
          <div className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => props.onOpenChange(false)}
          >
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Explain sub-tab ──────────────────────────────────────────────────
function ExplainTab({
  responseHeaders,
  responseBody,
  authHeader,
}: {
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  authHeader?: [string, string];
}) {
  // JWT decode (if any)
  const jwtInfo = useMemo(() => {
    if (!authHeader) return null;
    const token = authHeader[1].replace(/^Bearer\s+/i, "").trim();
    return decodeJwt(token);
  }, [authHeader]);

  // JSON annotation
  const jsonAnnotation = useMemo(() => {
    if (!responseBody) return null;
    try {
      const parsed = JSON.parse(responseBody);
      return { ok: true, tree: annotateJson(parsed), summary: summarizeAnnotated(annotateJson(parsed)) };
    } catch {
      return null;
    }
  }, [responseBody]);

  return (
    <div className="space-y-3">
      {jwtInfo && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Lightbulb className="size-3 text-amber-500" />
            JWT détecté dans Authorization
            {jwtInfo.expired && (
              <span className="ml-auto text-[10px] font-bold uppercase rounded bg-red-500/20 text-red-700 px-1.5 py-0.5">
                expiré
              </span>
            )}
          </p>
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-muted/40 p-2 rounded">
            {JSON.stringify(
              { header: jwtInfo.header, payload: jwtInfo.payload, exp: jwtInfo.expiresAt },
              null,
              2
            )}
          </pre>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <p className="text-xs font-semibold">Headers de réponse</p>
        {responseHeaders && Object.keys(responseHeaders).length > 0 ? (
          <div className="space-y-1">
            {Object.entries(responseHeaders).map(([k, v]) => {
              const ex = explainHeader(k, v);
              return (
                <div key={k} className="text-[11px] space-y-0.5">
                  <div>
                    <span className="font-mono font-bold">{k}</span>
                    <span className="text-muted-foreground">: </span>
                    <span className="font-mono break-all">{v}</span>
                  </div>
                  <p className="text-muted-foreground italic pl-3">{ex.description}</p>
                  {ex.warnings.length > 0 && (
                    <ul className="pl-3 space-y-0.5">
                      {ex.warnings.map((w, i) => (
                        <li key={i} className="text-amber-600">⚠ {w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Aucun header</p>
        )}
      </div>

      {jsonAnnotation?.ok && jsonAnnotation.tree && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
          <p className="text-xs font-semibold">Structure JSON</p>
          <p className="text-[10px] font-mono text-muted-foreground">
            {jsonAnnotation.summary}
          </p>
        </div>
      )}
    </div>
  );
}
