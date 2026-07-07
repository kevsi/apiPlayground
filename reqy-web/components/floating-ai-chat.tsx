"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Sparkles, X, Send, Loader2, Minimize2, ChevronDown, Bot, Clock } from "lucide-react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAIEngine } from "@/hooks/use-ai-engine"
import { useAiContext } from "@/hooks/use-ai-context"
import { persistence } from "@/lib/persistence"
import { type AIProvider } from "@/lib/projects-store"
import { MessageActions } from "@/components/message-actions"
import { toast } from "@/hooks/use-toast"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface ConversationSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

type ChatState = "closed" | "minimized" | "open"

export function FloatingAiChat() {
  const pathname = usePathname()
  const [chatState, setChatState] = useState<ChatState>("closed")
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try {
      return persistence.getItem<string>("reqly-hide-ai-chat") === "true"
    } catch {
      return false
    }
  })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingText, setEditingText] = useState("")
  const [conversationHistory, setConversationHistory] = useState<ConversationSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const aiContext = useAiContext()
  const aiEngine = useAIEngine()

  const HISTORY_STORAGE_KEY = "floating-ai-chat-history"
  const MESSAGES_STORAGE_KEY = "reqly-ai-chat-history"

  const getSessionTitle = (msgs: ChatMessage[]) => {
    const firstUserMessage = msgs.find((msg) => msg.role === "user")?.content || "Nouvelle conversation"
    return firstUserMessage.length > 40
      ? `${firstUserMessage.slice(0, 37)}...`
      : firstUserMessage
  }

  const formatSessionDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    })
  }

  const loadConversationHistory = () => {
    if (typeof window === "undefined") return []
    const raw = persistence.getItem<string>(HISTORY_STORAGE_KEY)
    if (!raw) return []

    try {
      const parsed = JSON.parse(raw) as ConversationSession[]
      return parsed
    } catch {
      return []
    }
  }

  const saveConversationHistory = (history: ConversationSession[]) => {
    if (typeof window === "undefined") return
    if (history.length === 0) {
      try { void persistence.removeItem(HISTORY_STORAGE_KEY) } catch { /* ignore */ }
      return
    }

    try { void persistence.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history)) } catch { /* ignore */ }
  }

  const loadSession = (session: ConversationSession) => {
    setMessages(session.messages)
    setCurrentSessionId(session.id)
    setChatState("open")
    setHistoryOpen(false)
  }

  /* ── Load saved conversation history ─────────────────────────── */
  useEffect(() => {
    const historyTimeout = window.setTimeout(() => {
      setConversationHistory(loadConversationHistory())
    }, 0)
    return () => window.clearTimeout(historyTimeout)
  }, [])

  /* ── Persist conversation history locally ────────────────────── */
  useEffect(() => {
    saveConversationHistory(conversationHistory)
  }, [conversationHistory])

  /* ── Load messages from localStorage on mount ───────────────── */
  useEffect(() => {
    if (typeof window === "undefined") return
    const loadTimeout = window.setTimeout(() => {
      try {
        const raw = persistence.getItem<string>(MESSAGES_STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as ChatMessage[]
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed)
          }
        }
      } catch {
        // ignore corrupt data
      }
    }, 0)

    return () => window.clearTimeout(loadTimeout)
  }, [])

  /* ── Persist messages to localStorage, trimmed to 50 ────────── */
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const trimmed = messages.slice(-50)
      void persistence.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
      // quota exceeded, silently ignore
    }
  }, [messages])

  /* ── Keep the active session up to date with message changes ──── */
  useEffect(() => {
    if (messages.length === 0) return

    const historyTimeout = window.setTimeout(() => {
      setConversationHistory((prev) => {
        const title = getSessionTitle(messages)
        const timestamp = new Date().toISOString()

        if (currentSessionId) {
          return prev.map((session) =>
            session.id === currentSessionId
              ? { ...session, title, messages, updatedAt: timestamp }
              : session
          )
        }

        const newSession: ConversationSession = {
          id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}`,
          title,
          messages,
          createdAt: timestamp,
          updatedAt: timestamp,
        }

        setCurrentSessionId(newSession.id)
        return [...prev, newSession]
      })
    }, 0)

    return () => window.clearTimeout(historyTimeout)
  }, [messages, currentSessionId])

  /* ── Auto-scroll to latest message ─────────────────────────────── */
  useEffect(() => {
    if (chatState === "open") {
      const el = messagesEndRef.current?.parentElement
      if (!el) return
      const threshold = 80
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" })
      }
    }
  }, [messages, chatState])

  /* ── Focus input when chat opens ──────────────────────────────── */
  useEffect(() => {
    if (chatState === "open") {
      setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [chatState])

  /* ── Send message ─────────────────────────────────────────────── */
  const handleSend = useCallback(async () => {
    const prompt = input.trim()
    if (!prompt || loading) return

    setError(null)
    setInput("")

    const userMsg: ChatMessage = { role: "user", content: prompt }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const assistantContent = await aiEngine.sendMessage(
        prompt,
        aiContext.systemPrompt,
        aiEngine.buildContext()
      )
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantContent || "L'IA n'a pas renvoyé de réponse." },
      ])
    } catch (err) {
      setError(`Erreur réseau : ${String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [input, loading, aiContext.systemPrompt, aiEngine])

  /* ── Keyboard submit ──────────────────────────────────────────── */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleEditMessage = (index: number) => {
    if (messages[index].role === "user") {
      setEditingIndex(index)
      setEditingText(messages[index].content)
      setInput(messages[index].content)
    }
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setEditingText("")
    setInput("")
  }

  const handleConfirmEdit = async () => {
    if (!editingText.trim()) {
      handleCancelEdit()
      return
    }

    const newMessages = messages.slice(0, editingIndex ?? 0)
    setMessages(newMessages)
    setEditingIndex(null)
    setEditingText("")

    setInput(editingText)
    setTimeout(() => {
      handleSend()
    }, 0)
  }

  const handleRetryMessage = async (assistantMessageIndex: number) => {
    let lastUserMessageIndex = -1
    for (let i = assistantMessageIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserMessageIndex = i
        break
      }
    }

    if (lastUserMessageIndex === -1) return

    const lastUserMessage = messages[lastUserMessageIndex].content
    const newMessages = messages.slice(0, assistantMessageIndex)
    setMessages(newMessages)

    setInput(lastUserMessage)
    setLoading(true)
    setError(null)

    try {
      const assistantContent = await aiEngine.sendMessage(lastUserMessage, aiContext.systemPrompt, aiEngine.buildContext())
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantContent || "L'IA n'a pas renvoyé de réponse." },
      ])
    } catch (err) {
      setError(`Erreur réseau : ${String(err)}`)
    } finally {
      setLoading(false)
      setInput("")
    }
  }

  /* ── Toggle chat open / close ─────────────────────────────────── */
  const toggleChat = () => {
    setChatState((prev) => {
      if (prev === "closed" || prev === "minimized") return "open"
      return "closed"
    })
  }

  const minimize = () => setChatState("minimized")
  const close = () => setChatState("closed")

  /* ── Unread indicator (messages from AI while minimized) ─────── */
  const hasUnread = chatState !== "open" && messages.some((m) => m.role === "assistant")
  const activeSession = conversationHistory.find((session) => session.id === currentSessionId)

  // React to same-tab persistent changes (e.g. when the sidebar "Show AI chat" button is clicked)
  useEffect(() => {
    const check = () => {
      try {
        const next = persistence.getItem<string>("reqly-hide-ai-chat") === "true"
        setHidden((prev) => (prev === next ? prev : next))
      } catch {
        /* ignore */
      }
    }
    const interval = window.setInterval(check, 1000)
    return () => window.clearInterval(interval)
  }, [])

  if (pathname === "/ai-insights") {
    return null
  }

  if (hidden) {
    return null
  }

  return (
    <>
      {/* ── Floating trigger (closed state only) ─────────────────────── */}
      <button
        id="floating-ask-ai-btn"
        onClick={toggleChat}
        aria-label="Assistant IA"
        title="Assistant IA"
        className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center justify-center rounded-full shadow-2xl",
          "size-12",
          "bg-violet-600 text-white",
          "transition-all duration-300 hover:scale-105 hover:shadow-[0_8px_30px_rgba(124,58,237,0.25)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
          chatState !== "closed" && "scale-95 opacity-0 pointer-events-none"
        )}
      >
        {hasUnread && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
        )}
        <Sparkles className="size-5" />
      </button>

      {/* ── Permanently hide the AI chat ─────────────────────────────── */}
      {chatState === "closed" && (
        <button
          onClick={() => {
            try {
              void persistence.setItem("reqly-hide-ai-chat", "true")
            } catch {
              /* storage unavailable, ignore */
            }
            setHidden(true)
          }}
          aria-label="Masquer le chat IA"
          title="Masquer le chat IA"
          className={cn(
            "fixed bottom-4 right-[72px] z-50 flex items-center justify-center rounded-full",
            "size-7 bg-slate-900/80 text-white/70 backdrop-blur-sm",
            "border border-white/10 shadow-lg",
            "transition-all duration-200 hover:bg-slate-800 hover:text-white",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          )}
        >
          <X className="size-3.5" />
        </button>
      )}

      {/* ── Chat panel ───────────────────────────────────────────────── */}
      <div
        id="floating-ai-chat-panel"
        role="dialog"
        aria-label="Monu IA mini-chat"
        className={cn(
          "fixed bottom-20 right-6 z-50 flex flex-col",
          "rounded-2xl border border-white/10 bg-[#0f1117] shadow-[0_20px_60px_rgba(0,0,0,0.5)]",
          "transition-all duration-300 origin-bottom-right",
          chatState === "open"
            ? "w-[calc(100vw-32px)] sm:w-[370px] max-w-sm max-h-[560px] opacity-100 scale-100 pointer-events-auto"
            : chatState === "minimized"
            ? "w-[calc(100vw-32px)] sm:w-[240px] max-h-[44px] opacity-100 scale-100 pointer-events-auto overflow-hidden"
            : "w-[calc(100vw-32px)] sm:w-[370px] max-w-sm max-h-[560px] opacity-0 scale-90 pointer-events-none"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-4 py-3",
            "bg-slate-950/95",
            "rounded-t-2xl border-b border-white/10 backdrop-blur-sm",
            chatState === "minimized" && "rounded-b-2xl"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Bot className="size-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-none truncate">
                Monu IA
              </p>
              <p className="text-[10px] text-white/60 truncate mt-0.5">
                {aiContext.contextSummary}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="hidden sm:inline rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70 font-medium truncate max-w-[80px]">
              {aiContext.pageLabel}
            </span>
            {activeSession && (
              <span
                className="hidden sm:inline rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70 font-medium truncate max-w-[110px]"
                title={activeSession.title}
              >
                {activeSession.title}
              </span>
            )}
            <button
              onClick={() => setHistoryOpen((prev) => !prev)}
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-white/70 transition-colors",
                historyOpen ? "bg-white/10 text-white" : "hover:bg-white/15 hover:text-white"
              )}
              aria-label="Historique des conversations"
              title="Historique des conversations"
            >
              <Clock className="size-4" />
            </button>
            {chatState === "open" && (
              <button
                onClick={minimize}
                className="flex size-6 items-center justify-center rounded-full text-white/70 hover:bg-white/15 hover:text-white transition-colors"
                aria-label="Réduire"
              >
                <Minimize2 className="size-3.5" />
              </button>
            )}
            {chatState === "minimized" && (
              <button
                onClick={() => setChatState("open")}
                className="flex size-6 items-center justify-center rounded-full text-white/70 hover:bg-white/15 hover:text-white transition-colors"
                aria-label="Agrandir"
              >
                <ChevronDown className="size-3.5 rotate-180" />
              </button>
            )}
            <button
              onClick={close}
              className="flex size-6 items-center justify-center rounded-full text-white/70 hover:bg-white/15 hover:text-white transition-colors"
              aria-label="Fermer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {historyOpen && (
          <div className="border-t border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                Historique des conversations
              </p>
              <button
                type="button"
                onClick={() => setConversationHistory([])}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/10"
              >
                Vider
              </button>
            </div>
            {conversationHistory.length === 0 ? (
              <p className="text-xs text-white/50">Aucun historique de conversation pour l’instant.</p>
            ) : (
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {conversationHistory.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => loadSession(session)}
                    className={cn(
                      "w-full rounded-2xl px-3 py-2 text-left text-sm transition",
                      session.id === currentSessionId
                        ? "bg-white/10 text-white"
                        : "bg-white/5 text-white/80 hover:bg-white/10"
                    )}
                  >
                    <div className="font-medium truncate">{session.title}</div>
                    <div className="mt-1 text-[10px] text-white/40">
                      {formatSessionDate(session.updatedAt)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages area */}
        {chatState === "open" && (
          <>
            <div className="flex-1 overflow-y-auto space-y-3 p-4 min-h-0">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[180px] gap-3 text-center px-3">
                  <div className="flex size-12 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10">
                    <Sparkles className="size-5 text-violet-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Bonjour, je suis Monu IA.</p>
                    <p className="mt-1 text-xs text-white/50 max-w-[240px] leading-relaxed">
                      Pose-moi une question sur ton API ou demande une recommandation de test.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      "Trouve des endpoints manquants",
                      "Explique mon erreur 500",
                      "Optimise cette route",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setInput(suggestion)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                        <Bot className="size-5" />
                      </div>
                    )}
                    {msg.role === "assistant" ? (
                      <div className="group/message relative max-w-[85%] rounded-[28px] bg-slate-900/85 border border-white/10 px-4 py-3 text-sm leading-relaxed shadow-sm">
                        <p className="whitespace-pre-wrap break-words text-white">{msg.content}</p>
                        <MessageActions
                          messageId={`msg-${i}`}
                          content={msg.content}
                          role="assistant"
                          onRetry={() => handleRetryMessage(i)}
                          isEditing={editingIndex === i}
                          className="text-xs"
                        />
                      </div>
                    ) : (
                      <div className="group/message relative max-w-[85%]">
                        {editingIndex === i ? (
                          <div className="rounded-[28px] bg-violet-700/90 px-4 py-3">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full resize-none rounded-lg bg-white/20 p-2 text-xs text-white placeholder:text-white/50 outline-none backdrop-blur-sm"
                              rows={2}
                            />
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={handleConfirmEdit}
                                disabled={!editingText.trim()}
                                className="flex-1 rounded-lg bg-white/20 px-2 py-1 text-xs font-medium transition hover:bg-white/30 disabled:opacity-50 text-white"
                              >
                                OK
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="flex-1 rounded-lg bg-white/10 px-2 py-1 text-xs font-medium transition hover:bg-white/20 text-white"
                              >
                                X
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-[28px] bg-violet-600/90 border border-white/10 px-4 py-3 text-sm leading-relaxed shadow-sm">
                            <p className="whitespace-pre-wrap break-words text-white">{msg.content}</p>
                          </div>
                        )}
                        {editingIndex !== i && (
                          <MessageActions
                            messageId={`msg-${i}`}
                            content={msg.content}
                            role="user"
                            onEdit={() => handleEditMessage(i)}
                            isEditing={editingIndex === i}
                            className="text-xs"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-[28px] bg-white/10 border border-white/10 px-4 py-3 shadow-sm">
                    <Loader2 className="size-3.5 animate-spin text-violet-300" />
                    <span className="text-xs text-white/60">Monu réfléchit…</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl bg-red-900/30 border border-red-500/30 px-3.5 py-2.5">
                  <p className="text-xs text-red-300 leading-relaxed">{error}</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-white/8 p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  id="floating-ai-chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Pose ta question… (Entrée pour envoyer)"
                  className={cn(
                    "flex-1 resize-none rounded-xl bg-white/8 border border-white/10",
                    "px-3 py-2 text-sm text-white placeholder:text-white/30",
                    "focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40",
                    "transition-all leading-relaxed max-h-28 overflow-y-auto"
                  )}
                  style={{ scrollbarWidth: "none" }}
                />
                <button
                  id="floating-ai-chat-send"
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  aria-label="Envoyer"
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl",
                    "bg-violet-600 text-white",
                    "transition-all hover:scale-105 hover:shadow-lg hover:shadow-violet-500/20",
                    "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                  )}
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </button>
              </div>

              <p className="mt-1.5 text-center text-[10px] text-white/25">
                Contexte :{" "}
                <span className="text-white/40 font-medium">{aiContext.pageLabel}</span>{" "}
                · Shift+Entrée pour nouvelle ligne
              </p>
            </div>
          </>
        )}
      </div>
    </>
  )
}
