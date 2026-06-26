"use client";

/**
 * Phase 2.7 — ChatPanel
 * Minimal chat UI that streams LLM responses from /api/proxy-ai.
 * Uses the existing useRequestStore (provider config) + analyzes the
 * active request via the local engine for context.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { analyze } from "@/src/ai/local-engine/analyzer";
import { buildRequestContext } from "@/src/ai/local-engine/context";
import { streamLLM } from "@/src/ai/cloud-engine/llm";
import { loadAIProvider, loadApiKey, loadOllamaConfig } from "@/lib/projects-store";
import type { AIProvider } from "@/src/ai/types";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  method: string;
  url: string;
  requestHeaders?: Array<{ key: string; value: string }>;
  body?: string;
  authType?: string;
  responseStatus?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  responseTime?: number;
}

export function ChatPanel(props: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;

    const provider = loadAIProvider();
    const apiKey = loadApiKey(provider);
    const ollama = loadOllamaConfig();

    if (provider !== "ollama" && !apiKey) {
      setError("Configure la clé API dans Settings avant d'utiliser le chat.")
      return
    }

    setError(null)
    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: prompt }])
    setLoading(true)

    // Build context from current request/response
    const headerRecord: Record<string, string> = {}
    for (const h of props.requestHeaders ?? []) {
      if (h.key) headerRecord[h.key] = h.value
    }
    const ctx = buildRequestContext(
      {
        method: props.method as any,
        url: props.url ?? "",
        headers: headerRecord,
        body: props.body ?? null,
        authType: (props.authType ?? "none") as any,
      },
      props.responseStatus !== undefined
        ? {
            status: props.responseStatus,
            statusText: "",
            headers: props.responseHeaders ?? {},
            body: props.responseBody,
            duration: props.responseTime ?? 0,
            size: 0,
          }
        : undefined
    )
    const diagnostics = analyze(ctx)

    // Stream response
    const controller = new AbortController()
    abortRef.current = controller
    // Add placeholder assistant message
    setMessages((prev) => [...prev, { role: "assistant", content: "" }])

    try {
      const stream = streamLLM({
        provider: provider as AIProvider,
        apiKey: apiKey ?? "",
        model: provider === "ollama" ? ollama.model || "llama2" : undefined,
        host: ollama.host,
        port: ollama.port,
        question: prompt,
        ctx,
        diagnostics,
        signal: controller.signal,
      })

      let acc = ""
      for await (const token of stream) {
        acc += token
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: "assistant", content: acc }
          return updated
        })
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(e?.message ?? "Erreur inconnue")
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [input, loading, props])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setLoading(false)
  }

  return (
    <div className="flex h-full flex-col" data-testid="reqlyai-chat-panel">
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[200px] gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Bot className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Chat LLM ReqlyAI</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-[260px]">
                Pose une question sur ta requête. Le contexte (requête + réponse + diagnostics locaux) est injecté automatiquement.
              </p>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}
          >
            {m.role === "assistant" && (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bot className="size-4 text-primary" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
              )}
            >
              {m.content || (loading && m.role === "assistant" && <Loader2 className="size-4 animate-spin" />)}
            </div>
            {m.role === "user" && (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="size-4 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}
      </div>
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Pose ta question... (Entrée pour envoyer, Shift+Entrée = nouvelle ligne)"
            disabled={loading}
            rows={2}
            className="resize-none text-sm"
          />
          {loading ? (
            <Button onClick={handleStop} variant="destructive" size="sm">
              Stop
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!input.trim()}
              size="sm"
              data-testid="chat-send-btn"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
