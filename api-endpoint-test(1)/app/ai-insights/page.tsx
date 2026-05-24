"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Sparkles, Loader2, Send, Users, Bell, ChevronsUpDown, Check, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiSidebar } from "@/components/api-sidebar"
import { useSidebar } from "@/contexts/sidebar-context"
import { EnvironmentSelector } from "@/components/environment-selector"
import { MessageActions } from "@/components/message-actions"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useRequestStore } from "@/hooks/use-request-store"
import { loadApiKey, saveApiKey, loadAIProvider, loadOllamaConfig, type AIProvider } from "@/hooks/use-projects-store"
import { useAIEngine } from "@/hooks/use-ai-engine"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "ollama", label: "Ollama" },
]

const SUGGESTIONS = [
  "Donne-moi une recommandation de test API pour ce projet.",
  "Résume les routes principales de ce projet.",
  "Propose une requête de test basée sur l'historique récent.",
  "Aide-moi à corriger un endpoint.",
]

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface ConversationSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
}

export default function AiInsightsPage() {
  const { isCollapsed, toggleSidebar } = useSidebar()
  const { history, projects, selectedProjectId, setSelectedProject, notifications, addNotification, markNotificationRead, clearNotifications, requestSystemNotificationPermission, systemNotificationPermission } = useRequestStore()
  const selectedProject = projects.find((project) => project.id === selectedProjectId)

  const [provider, setProvider] = useState<AIProvider>(() => loadAIProvider())
  const [apiKey, setApiKey] = useState(() => loadApiKey(loadAIProvider()))
  const aiEngine = useAIEngine()
  
  const isProviderConfigured = provider === "ollama" || (loadAIProvider() === provider && apiKey.trim().length > 0)
  
  const [query, setQuery] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingText, setEditingText] = useState("")
  const [conversationHistory, setConversationHistory] = useState<ConversationSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const currentHistory = useMemo(() => history.slice(0, 5), [history])

  const routeSummary = useMemo(() => {
    if (!selectedProject) {
      if (projects.length === 0) return "Aucun projet disponible. Ajoute un projet dans Mes Projets."
      return "Sélectionne un projet actif pour voir les routes disponibles."
    }
    const routes = selectedProject.routes.slice(0, 8)
    if (routes.length === 0) return "Aucun endpoint détecté"
    return routes.map((route) => `${route.method} ${route.path}`).join("\n")
  }, [selectedProject, projects.length])

  const requestSummary = useMemo(() => {
    if (currentHistory.length === 0) return "Aucun appel récent"
    return currentHistory
      .map((item) =>
        `${item.method} ${item.endpoint} → ${item.responseStatus ?? "-"} (${item.responseTime ?? "-"}ms)`
      )
      .join("\n")
  }, [currentHistory])

  const activeSession = useMemo(
    () => conversationHistory.find((session) => session.id === currentSessionId) ?? null,
    [conversationHistory, currentSessionId]
  )

  const getSessionTitle = (msgs: ChatMessage[]) => {
    const firstUserMessage = msgs.find((message) => message.role === "user")?.content
    if (!firstUserMessage) return `Conversation du ${new Date().toLocaleDateString()}`
    return firstUserMessage.length > 40
      ? `${firstUserMessage.slice(0, 40)}...`
      : firstUserMessage
  }

  const loadConversationHistory = () => {
    if (typeof window === "undefined") return []
    try {
      const raw = window.localStorage.getItem("ai-conversation-history")
      return raw ? (JSON.parse(raw) as ConversationSession[]) : []
    } catch {
      return []
    }
  }

  const saveConversationHistory = (historyData: ConversationSession[]) => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("ai-conversation-history", JSON.stringify(historyData))
  }

  const addMessagesToSession = (updatedMessages: ChatMessage[]) => {
    // If session already exists, just update it
    if (currentSessionId) {
      setConversationHistory((prev) =>
        prev.map((session) =>
          session.id === currentSessionId
            ? {
                ...session,
                title: getSessionTitle(updatedMessages),
                messages: updatedMessages,
              }
            : session
        )
      )
      return
    }

    // Create new session only if messages have changed
    const newSession: ConversationSession = {
      id: `session-${Date.now()}-${Math.random()}`,
      title: getSessionTitle(updatedMessages),
      messages: updatedMessages,
      createdAt: Date.now(),
    }
    setCurrentSessionId(newSession.id)
    setConversationHistory((prev) => [newSession, ...prev])
  }

  const loadSession = (sessionId: string) => {
    const session = conversationHistory.find((item) => item.id === sessionId)
    if (!session) return
    setMessages(session.messages)
    setCurrentSessionId(session.id)
    setHistoryOpen(false)
  }

  const startNewConversation = () => {
    setMessages([])
    setEditingIndex(null)
    setEditingText("")
    setCurrentSessionId(null)
    setHistoryOpen(false)
  }

  useEffect(() => {
    setConversationHistory(loadConversationHistory())
  }, [])

  useEffect(() => {
    saveConversationHistory(conversationHistory)
  }, [conversationHistory])

  const getOllamaConfig = () => {
    const config = loadOllamaConfig()
    return {
      host: config.host || "127.0.0.1",
      port: config.port || 11434,
      model: config.model || "llama2",
    }
  }

  const systemInstructions = (() => {
    const selectedProjectInfo = selectedProject
      ? `Projet sélectionné : ${selectedProject.name} (${selectedProject.framework})\nPort : ${selectedProject.port ?? "inconnu"}\nRoutes détectées : ${selectedProject.routes.length}`
      : "Aucun projet sélectionné."

    return `Tu es un assistant IA global pour un outil de tests d'API. Tu disposes du contexte suivant :\n${selectedProjectInfo}\n\nRoutes détectées :\n${routeSummary}\n\nHistorique des appels :\n${requestSummary}\n\nRéponds de manière claire, concise et aide l'utilisateur à comprendre, corriger ou enrichir ses requêtes et endpoints. Ne génère que la réponse sans autres fioritures.`
  })();

  const handleProviderChange = (value: AIProvider) => {
    setProvider(value)
    setApiKey(loadApiKey(value))
  }

  const handleSend = async () => {
    const prompt = query.trim()
    if (!prompt) return
    if (provider !== "ollama" && !isProviderConfigured) {
      toast({ title: "Enregistre la configuration IA avant d'envoyer un message.", variant: "destructive" })
      return
    }

    const userMessage: ChatMessage = { role: "user", content: prompt }
    setMessages((prev) => {
      const updatedMessages = [...prev, userMessage]
      addMessagesToSession(updatedMessages)
      return updatedMessages
    })
    try {
      addNotification?.({ title: "Message envoyé", body: prompt, type: "info" })
    } catch {}
    
    setQuery("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
    setLoading(true)

    try {
      if (provider !== "ollama") saveApiKey(provider, apiKey)

      const overrideConfig = {
        provider,
        apiKey: provider === "ollama" ? undefined : apiKey.trim(),
        model: provider === "ollama" ? getOllamaConfig().model : undefined,
        ollamaUrl: provider === "ollama" ? `http://${getOllamaConfig().host}:${getOllamaConfig().port}` : undefined,
      }

      const assistantContent = await aiEngine.sendMessage(
        prompt,
        systemInstructions,
        aiEngine.buildContext(),
        overrideConfig,
      )

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: assistantContent || "L'IA n'a pas renvoyé de réponse.",
      }
      setMessages((prev) => {
        const updatedMessages = [...prev, assistantMessage]
        addMessagesToSession(updatedMessages)
        return updatedMessages
      })
      try {
        addNotification?.({ title: "Réponse IA reçue", body: assistantContent, type: "info" })
      } catch {}
    } catch (error) {
      toast({ title: `Erreur IA : ${String(error)}`, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

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
      setQuery(messages[index].content)
    }
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setEditingText("")
    setQuery("")
  }

  const handleConfirmEdit = async () => {
    if (!editingText.trim()) {
      handleCancelEdit()
      return
    }

    // Remove the edited message and any assistant responses after it
    const newMessages = messages.slice(0, editingIndex ?? 0)
    setMessages(newMessages)
    setEditingIndex(null)
    setEditingText("")

    // Resend the edited message
    setQuery(editingText)
    // Use setTimeout to ensure state is updated before sending
    setTimeout(() => {
      handleSend()
    }, 0)
  }

  const handleRetryMessage = async (assistantMessageIndex: number) => {
    // Find the last user message before this assistant message
    let lastUserMessageIndex = -1
    for (let i = assistantMessageIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserMessageIndex = i
        break
      }
    }

    if (lastUserMessageIndex === -1) return

    const lastUserMessage = messages[lastUserMessageIndex].content

    // Remove the assistant message we want to retry
    const newMessages = messages.slice(0, assistantMessageIndex)
    setMessages(newMessages)

    // Resend the user message
    setQuery(lastUserMessage)
    setLoading(true)

    try {
      if (provider !== "ollama") saveApiKey(provider, apiKey)

      const overrideConfig = {
        provider,
        apiKey: provider === "ollama" ? undefined : apiKey.trim(),
        model: provider === "ollama" ? getOllamaConfig().model : undefined,
        ollamaUrl: provider === "ollama" ? `http://${getOllamaConfig().host}:${getOllamaConfig().port}` : undefined,
      }

      const assistantContent = await aiEngine.sendMessage(
        lastUserMessage,
        systemInstructions,
        aiEngine.buildContext(),
        overrideConfig,
      )

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: assistantContent || "L'IA n'a pas renvoyé de réponse.",
      }
      setMessages((prev) => {
        const updatedMessages = [...prev, assistantMessage]
        addMessagesToSession(updatedMessages)
        return updatedMessages
      })
      try {
        addNotification?.({ title: "Réponse IA régénérée", body: assistantContent, type: "info" })
      } catch {}
    } catch (error) {
      toast({ title: `Erreur IA : ${String(error)}`, variant: "destructive" })
    } finally {
      setLoading(false)
      setQuery("")
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className="flex h-screen bg-background">
      <ApiSidebar activePage="ai-insights" collapsed={isCollapsed} onCollapse={toggleSidebar} />

      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out",
          isCollapsed ? "ml-[60px]" : "ml-64",
          "max-[916px]:ml-[60px]"
        )}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded border border-border bg-card">
              <Sparkles className="size-4 text-foreground" />
            </div>
            <span className="font-semibold text-sm text-foreground">Monu IA</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 sm:flex">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-2 border-dashed font-normal">
                    <div className="size-2 rounded-full bg-muted-foreground" />
                    <span className="max-w-[120px] truncate text-foreground">{selectedProject ? selectedProject.name : "Aucun projet"}</span>
                    <ChevronsUpDown className="size-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[220px]">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Projets</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {projects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => setSelectedProject(p.id)}
                      className="flex items-center gap-2"
                    >
                      <span className="truncate flex-1">{p.name}</span>
                      {selectedProjectId === p.id && <Check className="size-3.5 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-2 border-dashed font-normal">
                    <span className="max-w-[100px] truncate text-foreground">{PROVIDERS.find((item) => item.value === provider)?.label}</span>
                    <ChevronsUpDown className="size-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[160px]">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Provider</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {PROVIDERS.map((item) => (
                    <DropdownMenuItem
                      key={item.value}
                      onClick={() => handleProviderChange(item.value)}
                      className="flex items-center gap-2"
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {provider === item.value && <Check className="size-3.5 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                onClick={startNewConversation}
                className="h-8 rounded-2xl border border-border bg-card px-3 text-sm text-foreground transition hover:border-primary/50 hover:bg-primary/5"
              >
                Nouvelle conversation
              </button>

              <button
                type="button"
                onClick={() => setHistoryOpen((prev) => !prev)}
                className="h-8 rounded-2xl border border-border bg-card px-3 text-sm text-foreground transition hover:border-primary/50 hover:bg-primary/5"
              >
                {historyOpen ? "Fermer l’historique" : "Historique"}
              </button>
            </div>

            <EnvironmentSelector />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <Bell className="size-5" />
                  {notifications && notifications.some((n) => !n.read) && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[300px]">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(systemNotificationPermission !== "granted" && systemNotificationPermission !== "unsupported") && (
                  <div className="p-3 border-b border-border">
                    <button
                      className="text-sm text-primary hover:underline"
                      onClick={async () => {
                        try {
                          const res = await requestSystemNotificationPermission()
                          if (res === "granted") {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            toast({ title: "Notifications système activées", meta: { event: "notificationPermission" } } as any)
                          }
                        } catch {}
                      }}
                    >
                      Activer notifications système
                    </button>
                  </div>
                )}
                {(!notifications || notifications.length === 0) ? (
                  <div className="p-3 text-sm text-muted-foreground">Aucune notification</div>
                ) : (
                  notifications.map((n) => (
                    <DropdownMenuItem key={n.id} onClick={() => markNotificationRead(n.id)} className="flex flex-col items-start gap-1">
                      <div className="flex items-center justify-between w-full">
                        <span className="text-sm font-medium">{n.title}</span>
                        <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleTimeString()}</span>
                      </div>
                      {n.body && <div className="text-xs text-muted-foreground truncate w-full">{n.body}</div>}
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <div className="p-2">
                  <button className="text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => clearNotifications()}>Effacer</button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 flex flex-col relative overflow-hidden bg-background">
          <div className="flex-1 overflow-y-auto px-4 py-8 md:px-8">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center space-y-6 px-4 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                  <Sparkles className="size-8 text-foreground" />
                </div>
                <div className="max-w-2xl">
                  <h2 className="text-3xl font-semibold text-foreground">Assistant IA</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Pose une question à Monu IA et reçois des recommandations précises pour tes APIs, tests et endpoints.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 max-w-3xl w-full">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setQuery(suggestion)}
                      className="rounded-3xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground shadow-sm transition hover:border-primary/40 hover:bg-accent"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-6 pb-4">
                {messages.map((message, index) => (
                  <div key={index} className={cn("flex gap-4", message.role === "user" ? "justify-end" : "justify-start")}> 
                    {message.role === "assistant" ? (
                      <>
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Bot className="size-5 text-foreground" />
                        </div>
                        <div className="group/message relative max-w-[85%] rounded-[28px] border border-border bg-card px-5 py-4 text-[15px] text-foreground shadow-sm">
                          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                          <MessageActions
                            messageId={`msg-${index}`}
                            content={message.content}
                            role="assistant"
                            onRetry={() => handleRetryMessage(index)}
                            isEditing={editingIndex === index}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="group/message relative max-w-[85%]">
                          {editingIndex === index ? (
                            <div className="rounded-[28px] bg-card px-5 py-4 text-[15px] text-foreground shadow-sm border border-border">
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="w-full resize-none rounded-lg border border-border bg-muted/20 p-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                                rows={2}
                              />
                              <div className="mt-3 flex gap-2">
                                <button
                                  onClick={handleConfirmEdit}
                                  disabled={!editingText.trim()}
                                  className="flex-1 rounded-lg bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50"
                                >
                                  Valider
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="flex-1 rounded-lg bg-muted/10 px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted/20"
                                >
                                  Annuler
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-[28px] bg-primary/10 px-5 py-4 text-[15px] text-primary shadow-sm border border-border">
                              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                            </div>
                          )}
                          {editingIndex !== index && (
                            <MessageActions
                              messageId={`msg-${index}`}
                              content={message.content}
                              role="user"
                              onEdit={() => handleEditMessage(index)}
                              isEditing={editingIndex === index}
                            />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-4 justify-start">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot className="size-5 text-foreground" />
                    </div>
                    <div className="max-w-[70%] rounded-[28px] border border-border bg-card px-5 py-4 text-[15px] text-muted-foreground shadow-sm">
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin text-primary" />
                        <span>Monu IA réfléchit…</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="bg-background px-4 pb-6 pt-4 shrink-0">
            <div className="mx-auto w-full max-w-3xl">
              <div className="sticky bottom-0 z-10 rounded-[32px] border border-border bg-card/90 px-4 py-4 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] backdrop-blur-xl">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <textarea
                    ref={textareaRef}
                    value={query}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    className="min-h-[48px] flex-1 resize-none rounded-2xl border border-border bg-background/80 px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10"
                    placeholder="Pose ta question à Monu IA..."
                    rows={1}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={loading || !query.trim()}
                    aria-label="Envoyer le message"
                    className="ml-3 h-12 rounded-2xl px-4 text-sm font-medium shadow-sm transition hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        <span>Envoyer</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Send className="size-4" />
                        <span>Envoyer</span>
                      </div>
                    )}
                  </Button>
                </div>
                <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>L'IA peut faire des erreurs. Vérifie les informations importantes.</span>
                  <span>Entrée = envoyer · Shift + Entrée = nouvelle ligne</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {historyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative mx-4 w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lg max-h-[80vh] overflow-y-auto animate-in zoom-in-95 fade-in duration-300">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Historique des conversations</h2>
                  <p className="text-sm text-muted-foreground">Charge une conversation précédente ou commence-en une nouvelle.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="absolute right-4 top-4 rounded-lg text-muted-foreground transition hover:text-foreground"
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </div>

              {conversationHistory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 p-4 text-center text-sm text-muted-foreground">
                  Aucune conversation enregistrée.
                </div>
              ) : (
                <div className="space-y-2">
                  {conversationHistory.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => loadSession(session.id)}
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left text-sm transition",
                        currentSessionId === session.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/50 hover:bg-primary/5"
                      )}
                    >
                      <span className="font-medium text-foreground">{session.title}</span>
                      <span className="text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-6 flex gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/5"
                >
                  Fermer
                </button>
                {conversationHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConversationHistory([])
                      startNewConversation()
                    }}
                    className="flex-1 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/20"
                  >
                    Effacer tout
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
