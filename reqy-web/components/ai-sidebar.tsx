"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles,
  PanelRightClose,
  Send,
  Loader2,
  RotateCcw,
  Edit3,
  Clock,
  Trash2,
  Plus,
  ChevronDown,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRequestStore } from "@/hooks/use-request-store";
import { useShallow } from "zustand/react/shallow";
import { usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { persistence } from "@/lib/persistence";
import { callAI } from "@/lib/ai-engine/providers";
import { dispatchAIActions } from "@/lib/ai-engine/dispatch";
import {
  loadAIProvider,
  loadApiKey,
  loadAiBaseUrl,
  loadAiModel,
  loadOllamaConfig,
} from "@/lib/projects-store";
import type { AIContext, CurrentRequest, TestAssertion } from "@/lib/ai-engine/types";

// ── Constants ──────────────────────────────────────────────────────────────

const STORAGE_WIDTH_KEY = "ai-sidebar-width";
const HISTORY_KEY = "ai-sidebar-history";
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 300;
const MAX_WIDTH = 600;
const MAX_HISTORY = 50;

// ── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ConversationSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// ── Component ──────────────────────────────────────────────────────────────

interface AiSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function AiSidebar({ open, onClose }: AiSidebarProps) {
  const pathname = usePathname();
  const store = useRequestStore(
    useShallow((s) => ({
      currentRequest: s.currentRequest,
      lastResponse: s.lastResponse,
      environmentVariables: s.environmentVariables,
      collectionHistory: s.collectionHistory,
      activeCollection: s.activeCollection,
      patchRequest: s.patchRequest,
      addAssertions: s.addAssertions,
      setVariable: s.setVariable,
      setDoc: s.setDoc,
      addNotification: s.addNotification,
      executeRequest: s.executeRequest,
      aiAutoApply: s.aiAutoApply,
    })),
  );

  // Width
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = localStorage.getItem(STORAGE_WIDTH_KEY);
    return saved ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(saved))) : DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  // History
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Copy state
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // ── Persist width ────────────────────────────────────────────────────────

  useEffect(() => {
    localStorage.setItem(STORAGE_WIDTH_KEY, String(width));
  }, [width]);

  // ── Focus input when sidebar opens ───────────────────────────────────────

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ── Load/save sessions ───────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = persistence.getItem<ConversationSession[]>(HISTORY_KEY);
      if (raw && Array.isArray(raw)) setSessions(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const saveSessions = useCallback((updated: ConversationSession[]) => {
    setSessions(updated);
    persistence.setItem(HISTORY_KEY, updated.slice(0, MAX_HISTORY));
  }, []);

  // Track current session automatically
  useEffect(() => {
    if (!currentSessionId && messages.length === 0) {
      const id = crypto.randomUUID();
      setCurrentSessionId(id);
    }
  }, [currentSessionId, messages.length]);

  // Save messages to current session
  useEffect(() => {
    if (!currentSessionId || messages.length === 0) return;
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === currentSessionId);
      let updated: ConversationSession[];
      if (existing) {
        updated = prev.map((s) =>
          s.id === currentSessionId ? { ...s, messages, updatedAt: new Date().toISOString() } : s,
        );
      } else {
        const title =
          messages.find((m) => m.role === "user")?.content.slice(0, 50) || "Nouvelle conversation";
        updated = [
          ...prev,
          {
            id: currentSessionId,
            title: title.length > 40 ? title.slice(0, 37) + "..." : title,
            messages,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      }
      persistence.setItem(HISTORY_KEY, updated.slice(0, MAX_HISTORY));
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, currentSessionId]);

  // ── Resize ───────────────────────────────────────────────────────────────

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, rect.right - e.clientX));
      setWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // ── Send ─────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;
      setError(null);
      const userMsg: ChatMessage = { role: "user", content: content.trim() };
      const updated = [...messages, userMsg];
      setMessages(updated);
      setInput("");
      setIsLoading(true);

      try {
        // Build context
        const ctx: AIContext = {
          currentRequest: store.currentRequest ?? {
            method: "GET",
            url: "",
            headers: {},
            params: {},
          },
          lastResponse: store.lastResponse ?? null,
          environmentVariables: store.environmentVariables ?? {},
          collectionHistory: (store.collectionHistory ?? []).slice(0, 10),
          activeCollection: store.activeCollection ?? null,
        };

        // Load AI config from settings
        const provider = loadAIProvider();
        const apiKey = loadApiKey(provider);
        const aiModel = loadAiModel(provider);
        const aiBaseUrl = loadAiBaseUrl(provider);
        const ollamaConfig = loadOllamaConfig();

        const aiConfig = {
          provider,
          apiKey,
          model: aiModel || undefined,
          openaiUrl:
            provider === "openai" || provider === "custom" ? aiBaseUrl || undefined : undefined,
          ollamaUrl:
            provider === "ollama"
              ? `http://${ollamaConfig.host || "127.0.0.1"}:${ollamaConfig.port ?? 11434}`
              : undefined,
        };

        const systemContent = `Tu es un assistant IA intégré dans l'application Reqly (API Playground).
Page : ${pathname}

L'utilisateur te demande d'interagir avec l'application. Tu peux :
- Modifier la requête courante (méthode, URL, headers, body, auth)
- Ajouter des assertions de test
- Définir des variables d'environnement
- Exécuter des requêtes
- Gérer les collections
- Gérer les projets et workspaces
- Naviguer dans l'application

Contexte actuel de la requête :
${JSON.stringify(ctx, null, 2)}

Pour modifier la requête, utilise FILL_REQUEST.
Pour exécuter, utilise EXECUTE_REQUEST avec run:true dans FILL_REQUEST.
Pour ajouter des assertions, utilise ADD_ASSERTIONS.
Pour définir une variable, utilise SET_VARIABLE.

Réponds en français de manière concise et utile.
Quand tu proposes une action, explique ce que tu fais puis exécute-la.`;

        // Call AI with action pipeline
        const aiRes = await callAI(
          `[INSTUCTION]\n${content}\n\n[RÈGLES]\n${systemContent}[/INSTRUCTION]`,
          aiConfig,
        );

        // Dispatch actions to the store
        if (aiRes.actions && aiRes.actions.length > 0) {
          const handlers = {
            setRequest: (patch: Partial<CurrentRequest>) => store.patchRequest(patch),
            addAssertions: (assertions: TestAssertion[], autoApply?: boolean) =>
              store.addAssertions(assertions),
            setVariable: (name: string, value: string, description?: string) =>
              store.setVariable(name, value, description),
            setDoc: (markdown: string, title?: string) => store.setDoc(markdown, title),
            notify: (message: string) =>
              store.addNotification
                ? store.addNotification({
                    title: "Assistant IA",
                    body: String(message),
                    type: "info",
                  })
                : undefined,
            executeRequest: (request: Partial<CurrentRequest>) =>
              store.executeRequest ? (store.executeRequest as any)(request) : undefined,
            runBatch: async (requests: Array<Partial<CurrentRequest>>) => {
              const results: unknown[] = [];
              for (const req of requests) {
                if (store.executeRequest) {
                  const res = await (store.executeRequest as any)(req);
                  results.push(res);
                }
              }
              return results;
            },
            audit: (entry: { actionType: string; detail?: unknown; result?: unknown }) => {
              // optional — skip if not available
            },
          };

          await dispatchAIActions(aiRes.actions, handlers, ctx, {
            allowAutoApply: Boolean(store.aiAutoApply),
          });
        }

        const responseText = aiRes.summary || aiRes.actions?.[0]?.type || "Action effectuée.";
        setMessages((prev) => [...prev, { role: "assistant", content: responseText }]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur de communication avec l'IA";
        setError(msg);
        setMessages((prev) => [...prev, { role: "assistant", content: `❌ ${msg}` }]);
      } finally {
        setIsLoading(false);
        setEditingIndex(null);
        setEditingText("");
      }
    },
    [messages, isLoading, pathname, store],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Edit user message
  const handleEditStart = useCallback((index: number, content: string) => {
    setEditingIndex(index);
    setEditingText(content);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingIndex(null);
    setEditingText("");
  }, []);

  const handleEditConfirm = useCallback(() => {
    if (editingIndex === null || !editingText.trim()) return;
    // Truncate conversation at edit point, replace the user message
    const truncated = messages.slice(0, editingIndex);
    setMessages([...truncated, { role: "user", content: editingText.trim() }]);
    sendMessage(editingText.trim());
  }, [editingIndex, editingText, messages, sendMessage]);

  // Retry: find last user message and re-send
  const handleRetry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) sendMessage(lastUser.content);
  }, [messages, sendMessage]);

  // Copy message content
  const handleCopy = useCallback(async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  // History management
  const handleNewSession = useCallback(() => {
    setMessages([]);
    setCurrentSessionId(crypto.randomUUID());
    setHistoryOpen(false);
    setError(null);
  }, []);

  const handleSelectSession = useCallback((session: ConversationSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setHistoryOpen(false);
    setError(null);
  }, []);

  const handleDeleteSession = useCallback(
    (id: string) => {
      const updated = sessions.filter((s) => s.id !== id);
      saveSessions(updated);
      if (currentSessionId === id) {
        setMessages([]);
        setCurrentSessionId(crypto.randomUUID());
      }
    },
    [sessions, currentSessionId, saveSessions],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Overlay for mobile */}
      {open && <div className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={onClose} />}

      {/* Resize handle — only interactive when open */}
      {open && (
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10",
            "hover:bg-primary/30 hover:w-1.5 transition-all duration-150",
            isResizing && "bg-primary/50 w-1.5",
          )}
          onMouseDown={handleResizeStart}
        />
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={cn(
          "relative flex flex-col border-l border-border bg-background",
          "h-screen shrink-0 overflow-hidden",
          "transition-[width] duration-200 ease-out",
          isResizing && "transition-none",
        )}
        style={{ width: open ? width : 0 }}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-border px-4 h-12 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-semibold">Assistant IA</span>
          </div>
          <div className="flex items-center gap-1">
            {/* History toggle */}
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors",
                historyOpen
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
              title="Historique des conversations"
            >
              <Clock className="size-3.5" />
            </button>
            <button
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Fermer"
            >
              <PanelRightClose className="size-4" />
            </button>
          </div>
        </div>

        {/* ── History panel ──────────────────────────────────────────── */}
        {historyOpen && (
          <div className="border-b border-border bg-muted/20">
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-xs font-medium text-muted-foreground">Conversations</span>
              <button
                onClick={handleNewSession}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="size-3" /> Nouvelle
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto px-2 pb-2 space-y-0.5">
              {sessions.length === 0 && (
                <p className="text-xs text-muted-foreground/60 px-2 py-2">
                  Aucune conversation sauvegardée
                </p>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer text-xs",
                    s.id === currentSessionId
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                  onClick={() => handleSelectSession(s)}
                >
                  <span className="truncate flex-1">{s.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    title="Supprimer"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Messages ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto" ref={messagesEndRef}>
          <div className="p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-12">
                <Sparkles className="size-10 mb-3 text-primary/40" />
                <p className="text-sm font-medium">Assistant IA</p>
                <p className="text-xs mt-1 max-w-[240px]">
                  Demande-moi d'exécuter des requêtes, gérer des collections, ou naviguer dans
                  l'application.
                </p>
                <div className="mt-4 space-y-1.5">
                  {[
                    "Exécute GET /api/users",
                    "Crée une collection 'Tests API'",
                    "Importe le projet depuis GitHub",
                  ].map((hint) => (
                    <button
                      key={hint}
                      onClick={() => {
                        setInput(hint);
                        inputRef.current?.focus();
                      }}
                      className="block w-full rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-left"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="group relative">
                <div
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-primary/10 text-foreground ml-6"
                      : "bg-muted/30 text-foreground mr-6 border border-border/50",
                  )}
                >
                  {msg.content}
                </div>

                {/* Actions */}
                <div
                  className={cn(
                    "absolute top-1 hidden group-hover:flex gap-0.5",
                    msg.role === "user" ? "right-0" : "left-0",
                  )}
                >
                  {msg.role === "user" ? (
                    <button
                      onClick={() => handleEditStart(i, msg.content)}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      title="Modifier"
                    >
                      <Edit3 className="size-3" />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleCopy(msg.content, i)}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Copier"
                      >
                        {copiedIndex === i ? (
                          <Check className="size-3 text-green-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                      <button
                        onClick={handleRetry}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Re-essayer"
                      >
                        <RotateCcw className="size-3" />
                      </button>
                    </>
                  )}
                </div>

                {/* Editing overlay */}
                {editingIndex === i && (
                  <div className="mt-2 space-y-1.5">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={handleEditCancel}
                        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleEditConfirm}
                        disabled={!editingText.trim()}
                        className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        Envoyer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mr-6">
                <Loader2 className="size-3.5 animate-spin" />
                Réflexion…
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive mr-6">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* ── Input ──────────────────────────────────────────────────── */}
        <div className="border-t border-border p-3 shrink-0">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Demande à l'assistant…"
              disabled={isLoading}
              className="flex-1 text-sm"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
            L'IA n'agit que sur demande explicite
          </p>
        </div>
      </div>
    </>
  );
}
