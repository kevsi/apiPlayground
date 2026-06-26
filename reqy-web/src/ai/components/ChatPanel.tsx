"use client";

/**
 * Phase 2.7 + 5.4 + 5.5 + 7.5 — ChatPanel
 *
 * Streams LLM responses from /api/proxy-ai AND persists each turn to
 * Supabase via useChatHistory. The local streaming buffer handles live
 * token-by-token updates; persisted history is loaded on mount and
 * updated as messages complete.
 *
 * Listens for the global "reqly:focus-ai" event (dispatched by
 * AiShortcutBridge on Ctrl+Shift+A) to focus its textarea.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { AI_FOCUS_EVENT } from "@/components/ai-shortcut-bridge";
import { Send, Loader2, Bot, User, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { analyze } from "@/src/ai/local-engine/analyzer";
import { buildRequestContext } from "@/src/ai/local-engine/context";
import { streamLLM } from "@/src/ai/cloud-engine/llm";
import { loadAIProvider, loadApiKey, loadOllamaConfig } from "@/lib/projects-store";
import { useChatHistory, computeRequestId } from "@/hooks/use-chat-history";
import type { AIProvider } from "@/src/ai/types";
import { cn } from "@/lib/utils";

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

interface StreamedMessage {
  role: "user" | "assistant";
  content: string;
}

export function ChatPanel(props: ChatPanelProps) {
  const requestId = useMemo(
    () => (props.url ? computeRequestId(props.method, props.url) : null),
    [props.method, props.url]
  );

  const { messages: history, append, clear, authenticated } = useChatHistory(requestId);

  const [streamed, setStreamed] = useState<StreamedMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // When the underlying request changes, clear the local streaming buffer.
  useEffect(() => {
    setStreamed([]);
    setError(null);
  }, [requestId]);

  // Combined view: persisted history + in-flight streamed messages
  const allMessages = useMemo(() => {
    const historyMessages: StreamedMessage[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return [...historyMessages, ...streamed];
  }, [history, streamed]);

  // Listen for global "focus AI" shortcut (Ctrl+Shift+A → from AiShortcutBridge).
  useEffect(() => {
    function onFocusAi() {
      // Scroll the panel into view if it's inside a scrollable container.
      const root = textareaRef.current?.closest("[data-testid='reqlyai-chat-panel']");
      root?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      textareaRef.current?.focus();
    }
    window.addEventListener(AI_FOCUS_EVENT, onFocusAi);
    return () => window.removeEventListener(AI_FOCUS_EVENT, onFocusAi);
  }, []);

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages]);

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;

    const provider = loadAIProvider();
    const apiKey = loadApiKey(provider);
    const ollama = loadOllamaConfig();

    if (provider !== "ollama" && !apiKey) {
      setError("Configure la clé API dans Settings avant d'utiliser le chat.");
      return;
    }

    setError(null);
    setInput("");
    setLoading(true);

    // Persist user message immediately
    if (requestId) {
      void append("user", prompt);
    }

    // Add local streaming placeholder for both user + assistant so the UI updates instantly.
    setStreamed((prev) => [
      ...prev,
      { role: "user", content: prompt },
      { role: "assistant", content: "" },
    ]);

    // Build context from current request/response
    const headerRecord: Record<string, string> = {};
    for (const h of props.requestHeaders ?? []) {
      if (h.key) headerRecord[h.key] = h.value;
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
    );
    const diagnostics = analyze(ctx);

    // Stream response
    const controller = new AbortController();
    abortRef.current = controller;

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
      });

      let acc = "";
      for await (const token of stream) {
        acc += token;
        setStreamed((prev) => {
          const updated = [...prev];
          // The last message is the assistant placeholder
          updated[updated.length - 1] = { role: "assistant", content: acc };
          return updated;
        });
      }

      // Persist final assistant message
      if (requestId && acc.trim()) {
        void append("assistant", acc);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(e?.message ?? "Erreur inconnue");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, props, append, requestId]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape" && loading) {
      e.preventDefault();
      handleStop();
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const handleClear = () => {
    if (!requestId) return;
    void clear();
    setStreamed([]);
  };

  return (
    <div className="flex h-full flex-col" data-testid="reqlyai-chat-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {authenticated
            ? `${history.length} message${history.length === 1 ? "" : "s"} persisté${history.length === 1 ? "" : "s"}`
            : "Non connecté — historique non sauvegardé"}
        </span>
        {history.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-red-600"
            data-testid="chat-clear-btn"
          >
            <Trash2 className="size-3 mr-1" />
            Effacer
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {allMessages.length === 0 && (
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
        {allMessages.map((m, i) => (
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
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Pose ta question... (Entrée ou Ctrl+Entrée pour envoyer, Esc pour stop)"
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
  );
}
