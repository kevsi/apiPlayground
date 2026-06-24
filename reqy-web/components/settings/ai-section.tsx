"use client"

import { useEffect, useState } from "react"
import { Sparkles, ChevronsUpDown, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import type { AIProvider } from "@/lib/types"
import { persistence } from "@/lib/persistence"

interface AISectionProps {
  provider: AIProvider
  apiKey: string
  aiModel: string
  aiBaseUrl: string
  ollamaHost: string
  ollamaPort: string
  ollamaModel: string
  aiAutoApply: boolean | undefined
  showAiConfirm: boolean
  aiProviders: Array<{ value: AIProvider; label: string }>
  onProviderChange: (value: AIProvider) => void
  onSaveConfig: () => void
  setApiKey: (val: string) => void
  setAiModel: (val: string) => void
  setAiBaseUrl: (val: string) => void
  setOllamaHost: (val: string) => void
  setOllamaPort: (val: string) => void
  setOllamaModel: (val: string) => void
  setAiAutoApply: (val: boolean) => void
  setShowAiConfirm: (val: boolean) => void
}

interface ModelOption {
  id: string
  label: string
}

const STATIC_MODELS: Record<AIProvider, ModelOption[]> = {
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
  ollama: [
    { id: "llama3.2", label: "Llama 3.2" },
    { id: "qwen2.5-coder", label: "Qwen2.5 Coder" },
    { id: "phi3", label: "Phi-3" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek Chat" },
    { id: "deepseek-coder", label: "DeepSeek Coder" },
    { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
  "opencode-zen": [
    { id: "gpt-5", label: "GPT 5" },
    { id: "gpt-5-codex", label: "GPT 5 Codex" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
    { id: "grok-code", label: "Grok Code" },
  ],
}

const ANTHROPIC_NO_FETCH = new Set<AIProvider>(["anthropic"])

export default function AISection({
  provider, apiKey, aiModel, aiBaseUrl,
  ollamaHost, ollamaPort, ollamaModel,
  aiAutoApply, showAiConfirm, aiProviders,
  onProviderChange, onSaveConfig,
  setApiKey, setAiModel, setAiBaseUrl,
  setOllamaHost, setOllamaPort, setOllamaModel,
  setAiAutoApply, setShowAiConfirm,
}: AISectionProps) {
  const [advOpen, setAdvOpen] = useState(provider === "openai")
  const [ollamaOpen, setOllamaOpen] = useState(provider === "ollama")

  // --- Dynamic model fetching state ---
  const [models, setModels] = useState<ModelOption[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsFetched, setModelsFetched] = useState(false)

  // Reset model list whenever the provider changes so the user never picks
  // a model belonging to the previous provider.
  useEffect(() => {
    setModels([])
    setModelsFetched(false)
    setLoadingModels(false)
  }, [provider])

  async function handleFetchModels() {
    if (loadingModels) return
    setLoadingModels(true)
    try {
      let result: ModelOption[] = []

      if (ANTHROPIC_NO_FETCH.has(provider)) {
        // No public list endpoint — fall back to static list immediately.
        result = STATIC_MODELS[provider] ?? []
        toast.info("Liste statique utilisée pour Anthropic (pas d'endpoint public).")
      } else if (provider === "openrouter") {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { data?: Array<{ id: string; name?: string }> }
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
        const base = aiBaseUrl?.trim() || "https://api.openai.com/v1"
        const url = `${base.replace(/\/+$/, "")}/models`
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { data?: Array<{ id: string }> }
        result = (data.data ?? [])
          .filter((m) => typeof m.id === "string" && m.id.startsWith("gpt-"))
          .map((m) => ({ id: m.id, label: m.id }))
        if (result.length === 0) throw new Error("No gpt-* models in response")
      } else if (provider === "ollama") {
        const host = ollamaHost?.trim() || "127.0.0.1"
        const port = ollamaPort?.trim() || "11434"
        const url = `http://${host}:${port}/api/tags`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { models?: Array<{ name: string }> }
        result = (data.models ?? [])
          .filter((m) => typeof m.name === "string")
          .map((m) => ({ id: m.name, label: m.name }))
        if (result.length === 0) throw new Error("No local models found")
      } else if (provider === "deepseek") {
        // DeepSeek exposes /models but auth can be flaky; static fallback is safer.
        result = STATIC_MODELS[provider] ?? []
        toast.info("Liste statique utilisée pour DeepSeek.")
      } else if (provider === "opencode-zen") {
        const res = await fetch("https://opencode.ai/zen/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
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

      setModels(result)
      setModelsFetched(true)
      if (result.length > 0) {
        toast.success(`${result.length} modèles chargés pour ${provider}.`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const fallback = STATIC_MODELS[provider] ?? []
      setModels(fallback)
      setModelsFetched(true)
      toast.warning(
        `Échec du chargement (${message}). Fallback sur ${fallback.length} modèles statiques.`,
      )
    } finally {
      setLoadingModels(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="size-5 text-primary" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">Assistant IA</CardTitle>
            <CardDescription>Sélectionnez votre fournisseur et stockez la clé API localement.</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Fournisseur IA</label>
          <Select value={provider} onValueChange={(value) => onProviderChange(value as AIProvider)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choisir un fournisseur" />
            </SelectTrigger>
            <SelectContent>
              {aiProviders.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Clé API</label>
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Entrez votre clé API"
            disabled={provider === "ollama"}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {provider === "ollama"
              ? "Ollama est exécuté localement et ne nécessite pas de clé API."
              : "La clé est conservée dans le stockage local du navigateur et uniquement utilisée par l'assistant IA."}
          </p>
        </div>

        {provider !== "ollama" ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground">Modèle</label>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  loadingModels ||
                  !apiKey ||
                  ANTHROPIC_NO_FETCH.has(provider)
                }
                onClick={handleFetchModels}
                data-testid="ai-fetch-models"
                title={
                  ANTHROPIC_NO_FETCH.has(provider)
                    ? "Anthropic n'expose pas d'endpoint public de listing"
                    : apiKey
                      ? "Charger la liste depuis l'API du fournisseur"
                      : "Entrez une clé API pour activer le chargement"
                }
              >
                {loadingModels ? (
                  <>
                    <Loader2 className="mr-2 size-3 animate-spin" />
                    Chargement...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 size-3" />
                    Charger les modèles
                  </>
                )}
              </Button>
            </div>

            {modelsFetched && models.length > 0 ? (
              <Select value={aiModel} onValueChange={setAiModel}>
                <SelectTrigger className="w-full" data-testid="ai-model-select">
                  <SelectValue placeholder="Choisir un modèle" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="Cliquez sur Charger les modèles ou entrez un ID manuellement"
                data-testid="ai-model-input"
              />
            )}

            <p className="mt-2 text-xs text-muted-foreground">
              {ANTHROPIC_NO_FETCH.has(provider)
                ? "Anthropic n'expose pas d'endpoint public — la liste est statique. Entrez l'ID du modèle (ex. claude-sonnet-4-5)."
                : "Laissez vide pour utiliser le modèle par défaut. Pour g0i.ai, utilisez qwen3-coder-80b."}
            </p>
          </div>
        ) : null}

        {provider === "openai" ? (
          <Collapsible open={advOpen} onOpenChange={setAdvOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-2">
                Configuration avancée
                <ChevronsUpDown className="size-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Base URL OpenAI compatible</label>
                <Input
                  value={aiBaseUrl}
                  onChange={(event) => setAiBaseUrl(event.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Pour un endpoint OpenAI compatible comme g0i.ai, entrez l'URL de base et le modèle approprié.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-muted p-4">
                <p className="text-sm font-semibold">Quick Start OpenAI compatible</p>
                <p className="mt-2 text-xs text-muted-foreground">Exemple de configuration pour g0i.ai.</p>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground list-disc list-inside">
                  <li>Fournisseur IA : <strong>OpenAI</strong></li>
                  <li>Base URL : <strong>https://api.g0i.ai/v1</strong></li>
                  <li>Clé API : votre clé g0i.ai</li>
                  <li>Modèle : <strong>qwen3-coder-80b</strong></li>
                </ul>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {provider === "ollama" ? (
          <Collapsible open={ollamaOpen} onOpenChange={setOllamaOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-2">
                Configuration Ollama
                <ChevronsUpDown className="size-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="space-y-4 rounded-2xl border border-muted bg-muted p-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Host</label>
                  <Input value={ollamaHost} onChange={(e) => setOllamaHost(e.target.value)} placeholder="127.0.0.1" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Port</label>
                  <Input value={ollamaPort} onChange={(e) => setOllamaPort(e.target.value)} placeholder="11434" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Modèle Ollama</label>
                  <Input value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} placeholder="llama2" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Modèle local Ollama installé sur votre machine. Exemple : <code>llama2</code> ou <code>phi:latest</code>.
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Autoriser l'IA à appliquer automatiquement les changements</p>
            <p className="text-xs text-muted-foreground">Lorsque activé, les actions IA marquées <em>autoApply: true</em> pourront être appliquées automatiquement.</p>
          </div>
          <Switch checked={!!aiAutoApply} onCheckedChange={(v) => {
            const want = Boolean(v)
            if (want) {
              try {
                const confirmed = persistence.getItem<string>('probe_ai_autorun_confirmed') === 'true'
                if (!confirmed) {
                  setShowAiConfirm(true)
                  return
                }
              } catch { /* ignore */ }
            }
            setAiAutoApply(want)
          }} />
        </div>

        <Dialog open={showAiConfirm} onOpenChange={setShowAiConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmer l'exécution automatique par l'IA</DialogTitle>
              <DialogDescription>
                Autoriser l'IA à appliquer et exécuter des actions automatiquement peut envoyer des requêtes réseau depuis votre interface.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAiConfirm(false)}>Annuler</Button>
              <Button onClick={() => {
                try { void persistence.setItem('probe_ai_autorun_confirmed', 'true') } catch { /* ignore */ }
                setAiAutoApply(true)
                setShowAiConfirm(false)
              }}>Confirmer et activer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>

      <CardFooter className="border-t pt-5">
        <div className="flex items-center gap-3">
          <Button onClick={onSaveConfig}>Sauvegarder</Button>
          <span className="text-sm text-muted-foreground">Dernière configuration : {provider.toUpperCase()}</span>
        </div>
      </CardFooter>
    </Card>
  )
}
