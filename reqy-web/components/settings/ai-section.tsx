"use client"

import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

export default function AISection({
  provider, apiKey, aiModel, aiBaseUrl,
  ollamaHost, ollamaPort, ollamaModel,
  aiAutoApply, showAiConfirm, aiProviders,
  onProviderChange, onSaveConfig,
  setApiKey, setAiModel, setAiBaseUrl,
  setOllamaHost, setOllamaPort, setOllamaModel,
  setAiAutoApply, setShowAiConfirm,
}: AISectionProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3 text-foreground">
        <Sparkles className="size-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Assistant IA</h2>
          <p className="text-sm text-muted-foreground">Sélectionnez votre fournisseur et stockez la clé API localement.</p>
        </div>
      </div>

      <div className="space-y-4">
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
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Modèle</label>
              <Input
                value={aiModel}
                onChange={(event) => setAiModel(event.target.value)}
                placeholder="gpt-4o / qwen3-coder-80b"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Laissez vide pour utiliser le modèle par défaut. Pour g0i.ai, utilisez <code>qwen3-coder-80b</code>.
              </p>
            </div>

            {provider === "openai" ? (
              <>
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
              </>
            ) : null}
          </>
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

        {provider === "ollama" ? (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-muted p-4">
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
        ) : null}

        <div className="flex items-center gap-3">
          <Button onClick={onSaveConfig}>Sauvegarder</Button>
          <span className="text-sm text-muted-foreground">Dernière configuration : {provider.toUpperCase()}</span>
        </div>
      </div>
    </section>
  )
}
