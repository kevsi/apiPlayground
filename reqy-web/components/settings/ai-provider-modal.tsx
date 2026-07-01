"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Loader2,
  RefreshCw,
  Search,
  Plus,
  X,
  Check,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Command,
  CommandList,
  CommandEmpty,
} from "@/components/ui/command"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { AIProvider } from "@/lib/types"
import type { ProviderInfo } from "./ai-provider-card"

export interface ModelOption {
  id: string
  label: string
}

interface AiProviderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  providerInfo: ProviderInfo
  // Current saved values
  currentApiKey: string
  currentModel: string
  currentBaseUrl: string
  // Save handler
  onSave: (config: {
    apiKey: string
    model: string
    baseUrl: string
  }) => void
  // Delete handler
  onDelete?: () => void
}

const ANTHROPIC_NO_FETCH = new Set<AIProvider>(["anthropic"])

// Static model lists (same as existing AISection)
const STATIC_MODELS: Record<string, ModelOption[]> = {
  openrouter: [
    { id: "qwen/qwen3-coder", label: "Qwen3 Coder" },
    { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3" },
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
  anthropic: [
    { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek Chat" },
    { id: "deepseek-coder", label: "DeepSeek Coder" },
    { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
  ollama: [
    { id: "llama3.2", label: "Llama 3.2" },
    { id: "qwen2.5-coder", label: "Qwen2.5 Coder" },
    { id: "phi3", label: "Phi-3" },
  ],
  "opencode-zen": [],
  custom: [],
}

export function AiProviderModal({
  open,
  onOpenChange,
  providerInfo,
  currentApiKey,
  currentModel,
  currentBaseUrl,
  onSave,
  onDelete,
}: AiProviderModalProps) {
  const provider = providerInfo.value
  const isCustom = provider === "custom"

  // -- Form state --
  const [apiKey, setApiKey] = useState(currentApiKey)
  const [baseUrl, setBaseUrl] = useState(currentBaseUrl)
  const [selectedModel, setSelectedModel] = useState(currentModel)
  const [manualModelInput, setManualModelInput] = useState("")

  // -- Model fetching state --
  const [models, setModels] = useState<ModelOption[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsFetched, setModelsFetched] = useState(false)

  // -- Search state --
  const [searchQuery, setSearchQuery] = useState("")

  // Reset form when modal opens with different provider
  useEffect(() => {
    if (open) {
      setApiKey(currentApiKey)
      setBaseUrl(currentBaseUrl)
      setSelectedModel(currentModel)
      setManualModelInput("")
      setSearchQuery("")
      // Reset models to trigger fresh fetch
      setModels([])
      setModelsFetched(false)
      setLoadingModels(false)
    }
  }, [open, provider, currentApiKey, currentModel, currentBaseUrl])

  // Auto-fetch models after typing API key (same as existing AISection)
  useEffect(() => {
    if (!apiKey || provider === "ollama" || ANTHROPIC_NO_FETCH.has(provider)) return

    if (isCustom && !baseUrl.trim()) return

    const timeout = setTimeout(() => {
      void handleFetchModels()
    }, 1000)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, provider, baseUrl])

  const handleFetchModels = useCallback(async () => {
    if (loadingModels) return
    setLoadingModels(true)
    try {
      let result: ModelOption[] = []

      if (isCustom) {
        // Custom provider: use base URL + API key to fetch models
        const base = baseUrl?.trim() || "https://api.openai.com/v1"
        const url = `${base.replace(/\/+$/, "")}/models`
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          data?: Array<{ id: string }>
        }
        result = (data.data ?? [])
          .filter((m) => typeof m.id === "string")
          .map((m) => ({ id: m.id, label: m.id }))
        if (result.length === 0) throw new Error("Empty list")
      } else if (ANTHROPIC_NO_FETCH.has(provider)) {
        result = STATIC_MODELS[provider] ?? []
        toast.info("Liste statique utilisée (pas d'endpoint public).")
      } else if (provider === "openrouter") {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          data?: Array<{ id: string; name?: string }>
        }
        result = (data.data ?? [])
          .filter((m) => typeof m.id === "string")
          .map((m) => ({ id: m.id, label: m.name ?? m.id }))
        if (result.length === 0) throw new Error("Empty list")
      } else if (provider === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          models?: Array<{
            name?: string
            displayName?: string
            supportedGenerationMethods?: string[]
          }>
        }
        result = (data.models ?? [])
          .filter(
            (m) =>
              Array.isArray(m.supportedGenerationMethods) &&
              m.supportedGenerationMethods.includes("generateContent"),
          )
          .map((m) => {
            const id = (m.name ?? "").replace(/^models\//, "")
            return { id, label: m.displayName ?? id }
          })
          .filter((m) => m.id.length > 0)
        if (result.length === 0) throw new Error("Empty list")
      } else if (provider === "openai") {
        const base = baseUrl?.trim() || "https://api.openai.com/v1"
        const url = `${base.replace(/\/+$/, "")}/models`
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          data?: Array<{ id: string }>
        }
        result = (data.data ?? [])
          .filter((m) => typeof m.id === "string" && m.id.startsWith("gpt-"))
          .map((m) => ({ id: m.id, label: m.id }))
        if (result.length === 0) throw new Error("No gpt-* models in response")
      } else if (provider === "ollama") {
        // Ollama is handled separately, but we keep the modal pattern consistent
        const host = "127.0.0.1"
        const port = "11434"
        const url = `http://${host}:${port}/api/tags`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          models?: Array<{ name: string }>
        }
        result = (data.models ?? [])
          .filter((m) => typeof m.name === "string")
          .map((m) => ({ id: m.name, label: m.name }))
        if (result.length === 0) throw new Error("No local models found")
      } else if (provider === "deepseek") {
        result = STATIC_MODELS[provider] ?? []
        toast.info("Liste statique utilisée pour DeepSeek.")
      } else if (provider === "opencode-zen") {
        const res = await fetch("/api/proxy-models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          data?: Array<{ id: string; name?: string; owned_by?: string }>
        }
        result = (data.data ?? [])
          .filter((m) => typeof m.id === "string" && !m.id.startsWith("alpha-"))
          .map((m) => ({ id: m.id, label: m.name ?? m.id }))
        if (result.length === 0) throw new Error("Empty list")
      }

      // Merge with any manually added models
      setModels((prev) => {
        const existingIds = new Set(prev.map((m) => m.id))
        const newModels = result.filter((m) => !existingIds.has(m.id))
        return [...prev, ...newModels]
      })
      setModelsFetched(true)
      if (result.length > 0) {
        toast.success(`${result.length} modèles chargés.`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const fallback = STATIC_MODELS[provider] ?? []
      if (fallback.length > 0) {
        setModels((prev) => {
          const existingIds = new Set(prev.map((m) => m.id))
          const newModels = fallback.filter((m) => !existingIds.has(m.id))
          return [...prev, ...newModels]
        })
      }
      setModelsFetched(true)
      toast.warning(
        `Échec du chargement (${message}).${
          fallback.length > 0
            ? ` Fallback sur ${fallback.length} modèles statiques.`
            : ""
        }`,
      )
    } finally {
      setLoadingModels(false)
    }
  }, [provider, apiKey, baseUrl, isCustom, loadingModels])

  // Add manual model for custom provider
  const handleAddManualModel = () => {
    const id = manualModelInput.trim()
    if (!id) return
    if (models.some((m) => m.id === id)) {
      toast.info("Ce modèle existe déjà dans la liste.")
      setManualModelInput("")
      return
    }
    setModels((prev) => [...prev, { id, label: id }])
    setSelectedModel(id)
    setManualModelInput("")
    toast.success(`Modèle "${id}" ajouté.`)
  }

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId)
  }

  const handleRemoveManualModel = (modelId: string) => {
    // Only allow removing manually-added models (not from static or dynamic)
    setModels((prev) => prev.filter((m) => m.id !== modelId))
    if (selectedModel === modelId) {
      setSelectedModel("")
    }
  }

  // --- Test connection ---
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const handleTestConnection = async () => {
    if (!apiKey && provider !== "ollama") return
    if (!selectedModel && provider !== "ollama") {
      setTestResult({ success: false, message: "Sélectionnez d'abord un modèle." })
      return
    }

    setTestLoading(true)
    setTestResult(null)

    try {
      // Determine the effective model for the test call
      const testModel = selectedModel || (provider === "ollama" ? "llama2" : undefined)
      if (!testModel) {
        setTestResult({ success: false, message: "Aucun modèle sélectionné." })
        setTestLoading(false)
        return
      }

      const body: Record<string, unknown> = {
        provider,
        apiKey: provider === "ollama" ? "" : apiKey,
        model: testModel,
        message: "Réponds uniquement par 'ok' si tu reçois ce message.",
        system: "Tu es un assistant de test. Réponds uniquement par 'ok'.",
      }

      // For custom/openai providers, send the base URL
      if (isCustom || provider === "openai") {
        body.openaiUrl = baseUrl
      }

      const res = await fetch("/api/proxy-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const errMsg = data.error || `HTTP ${res.status}`
        throw new Error(errMsg)
      }

      const content = typeof data.content === "string" ? data.content.trim() : ""
      if (content.toLowerCase().includes("ok")) {
        setTestResult({ success: true, message: "Connexion réussie ! Le modèle répond." })
        toast.success("Test réussi !")
      } else {
        setTestResult({
          success: true,
          message: `Réponse reçue (vérifiez que c'est correct) : "${content.slice(0, 100)}"`,
        })
        toast.success("Réponse reçue du modèle.")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setTestResult({ success: false, message: `Échec : ${message}` })
      toast.error(`Test échoué : ${message}`)
    } finally {
      setTestLoading(false)
    }
  }

  const handleSave = () => {
    onSave({
      apiKey,
      model: selectedModel,
      baseUrl: isCustom ? baseUrl : "",
    })
    onOpenChange(false)
  }

  // Filter models by search query
  const filteredModels = models.filter(
    (m) =>
      m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.label.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Separate selected model for display
  const selectedModelObj = models.find((m) => m.id === selectedModel)

  const FallbackIcon = providerInfo.fallbackIcon
  const hasIconPath = !!providerInfo.iconPath

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl overflow-hidden" style={{ padding: 0, gap: 0 }}>
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-border px-6 pt-6 pb-4">
          <div
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-xl overflow-hidden",
              "bg-gradient-to-br",
              providerInfo.gradient,
            )}
          >
            {hasIconPath ? (
              <img
                src={providerInfo.iconPath!}
                alt={providerInfo.label}
                className="size-7 object-contain"
                draggable={false}
              />
            ) : (
              <FallbackIcon className="size-6 text-primary" />
            )}
          </div>
          <div className="flex-1 space-y-1">
            <DialogTitle className="text-lg">{providerInfo.label}</DialogTitle>
            <DialogDescription className="text-sm">
              {isCustom
                ? "Configurez un fournisseur OpenAI compatible avec votre propre URL de base."
                : `Configurez votre clé API et choisissez un modèle ${providerInfo.label}.`}
            </DialogDescription>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5 max-h-[60vh] overflow-y-auto">
          {/* Base URL - only for custom provider */}
          {isCustom && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Base URL
              </label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                L&apos;URL de base de votre API compatible OpenAI. Ex:{" "}
                <code className="text-xs">https://api.g0i.ai/v1</code>
              </p>
            </div>
          )}

          {/* API Key */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Clé API
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                provider === "ollama"
                  ? "Non requis (exécution locale)"
                  : "Entrez votre clé API"
              }
              disabled={provider === "ollama"}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {provider === "ollama"
                ? "Ollama est exécuté localement et ne nécessite pas de clé API."
                : "La clé est conservée localement et utilisée uniquement par l'assistant IA."}
            </p>
          </div>

          {/* Model Selection */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground">
                Modèle{isCustom ? "s" : ""}
              </label>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    loadingModels ||
                    !apiKey ||
                    (isCustom && !baseUrl.trim()) ||
                    ANTHROPIC_NO_FETCH.has(provider)
                  }
                  onClick={handleFetchModels}
                  title={
                    ANTHROPIC_NO_FETCH.has(provider)
                      ? "Cet éditeur n'expose pas d'endpoint public"
                      : !apiKey
                        ? "Entrez une clé API pour activer le chargement"
                        : "Charger la liste depuis l'API"
                  }
                >
                  {loadingModels ? (
                    <>
                      <Loader2 className="mr-1.5 size-3 animate-spin" />
                      Chargement...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1.5 size-3" />
                      Charger
                    </>
                  )}
                </Button>
                {/* Add manual model for custom provider */}
                {isCustom && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddManualModel}
                    disabled={!manualModelInput.trim()}
                  >
                    <Plus className="mr-1 size-3" />
                    Ajouter
                  </Button>
                )}
              </div>
            </div>

            {/* Manual model input (only for custom) */}
            {isCustom && (
              <div className="mb-3">
                <div className="flex gap-2">
                  <Input
                    value={manualModelInput}
                    onChange={(e) => setManualModelInput(e.target.value)}
                    placeholder="Entrez un ID de modèle manuellement..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddManualModel()
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Selected model badge */}
            {selectedModelObj && (
              <div className="mb-3">
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1 px-3 py-1 text-xs"
                >
                  <Check className="size-3" />
                  {selectedModelObj.label}
                  <button
                    type="button"
                    onClick={() => setSelectedModel("")}
                    className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                  >
                    <X className="size-2.5" />
                  </button>
                </Badge>
              </div>
            )}

            {/* Model search list */}
            <div className="rounded-lg border border-border overflow-hidden">
              <Command className="rounded-lg">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <Search className="size-4 shrink-0 opacity-50" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher un modèle..."
                    className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <CommandList>
                  {models.length === 0 && !loadingModels && (
                    <CommandEmpty>
                      <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                        <Search className="size-8 opacity-30" />
                        {modelsFetched
                          ? "Aucun modèle trouvé"
                          : isCustom
                            ? "Chargez les modèles depuis l'API ou ajoutez-en manuellement"
                            : "Cliquez sur « Charger » pour récupérer les modèles"}
                      </div>
                    </CommandEmpty>
                  )}

                  {loadingModels && models.length === 0 && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {filteredModels.length > 0 && (
                    <ScrollArea className="h-48">
                      <div className="p-1 space-y-0.5">
                        {filteredModels.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleSelectModel(m.id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                              selectedModel === m.id
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-foreground hover:bg-accent",
                            )}
                          >
                            <div
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                                selectedModel === m.id
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/30",
                              )}
                            >
                              {selectedModel === m.id && (
                                <Check className="size-3" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">
                                {m.label}
                              </div>
                              {m.id !== m.label && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {m.id}
                                </div>
                              )}
                            </div>
                            {isCustom && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRemoveManualModel(m.id)
                                }}
                                className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                                title="Retirer"
                              >
                                <X className="size-3.5" />
                              </button>
                            )}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CommandList>
              </Command>
            </div>

            <p className="mt-1.5 text-xs text-muted-foreground">
              {isCustom
                ? "Ajoutez des modèles manuellement ou chargez-les depuis l'API."
                : provider === "anthropic"
                  ? "Anthropic n'expose pas d'endpoint public. Utilisez la liste statique."
                  : "Laissez vide pour utiliser le modèle par défaut."}
            </p>
          </div>
        </div>

        {/* Test result banner (between body and footer) */}
        {testResult && (
          <div
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 text-sm border-t border-dashed max-w-full",
              testResult.success
                ? "bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/50"
                : "bg-red-50/50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-red-200/50 dark:border-red-800/50",
            )}
          >
            {testResult.success ? (
              <Check className="size-4 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span className="flex-1 max-w-[180px] text-xs leading-relaxed" title={testResult.message}>
              {testResult.message}
            </span>
            <button
              type="button"
              onClick={() => setTestResult(null)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* Spacer if test result exists */}
        {testResult && <div className="h-2" />}

        {/* Footer */}
        <DialogFooter className="border-t border-border px-6 py-4">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDelete}
                  className="text-muted-foreground hover:text-destructive"
                >
                  Supprimer la configuration
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={
                  testLoading ||
                  (!apiKey && provider !== "ollama") ||
                  (!selectedModel && provider !== "ollama") ||
                  (isCustom && !baseUrl.trim())
                }
              >
                {testLoading ? (
                  <>
                    <Loader2 className="mr-1.5 size-3 animate-spin" />
                    Test…
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-1.5 size-3" />
                    Tester
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                size="sm"
              >
                Annuler
              </Button>
              <Button onClick={handleSave} size="sm">
                Sauvegarder
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
