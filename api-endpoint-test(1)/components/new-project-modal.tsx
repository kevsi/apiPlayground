"use client"

import { useState } from "react"
import { Loader2, FolderOpen, Sparkles, Code2, ChevronDown, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn, downloadJson } from "@/lib/utils"
import { isTauriAvailable } from "@/lib/tauri"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { AIProvider, AnalysisMode, SavedProject } from "@/hooks/use-projects-store"
import { loadApiKey, saveApiKey } from "@/hooks/use-projects-store"
import { analyzeProject } from '../lib/project-analyzer'
import { toast } from "sonner"

const PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (GPT-4o)" },
  { value: "gemini", label: "Gemini 2.0 Flash" },
  { value: "ollama", label: "Ollama (local)" },
]

interface NewProjectModalProps {
  open: boolean
  onClose: () => void
  onAdd: (p: SavedProject) => void
}

export function NewProjectModal({ open, onClose, onAdd }: NewProjectModalProps) {
  const [mode, setMode] = useState<AnalysisMode>("static")
  const [provider, setProvider] = useState<AIProvider>("anthropic")
  const [apiKey, setApiKey] = useState(() => loadApiKey("anthropic"))
  const [showKey, setShowKey] = useState(false)
  const [folderPath, setFolderPath] = useState("")
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState("")

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p)
    setApiKey(loadApiKey(p))
  }

  const pickFolder = async () => {
    if (isTauriAvailable()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog")
        const selected = await open({ directory: true, multiple: false })
        if (selected && typeof selected === "string") {
          setFolderPath(selected)
        }
      } catch {
        toast.error("Impossible d'ouvrir le sélecteur de dossier")
      }
    } else {
      downloadJson({ path: "" }, "dossier.json")
      toast.info("Mode navigateur : téléchargement d'un modèle JSON. Sous Tauri, le sélecteur de dossier natif sera disponible.")
    }
  }

  const analyze = async () => {
    if (!folderPath) { toast.error("Sélectionnez un dossier"); return }
    if (mode === "ai" && provider !== "ollama" && !apiKey.trim()) {
      toast.error("Clé API requise"); return
    }
    if (mode === "ai" && provider !== "ollama") saveApiKey(provider, apiKey)
    setLoading(true)
    try {
      setStep("Analyse en cours…")
      const result = await analyzeProject(folderPath, mode, mode === "ai" ? apiKey : undefined)
      
      const project: SavedProject = {
        id: `proj-${Date.now()}`,
        name: result.name,
        framework: result.framework,
        folderPath,
        port: result.port,
        routes: result.routes,
        analyzedAt: new Date().toISOString(),
        mode,
      }
      onAdd(project)
      toast.success(`${result.routes.length} routes détectées`)
      onClose()
      setFolderPath("")
    } catch (err) {
      toast.error(`Erreur : ${String(err)}`)
    } finally {
      setLoading(false)
      setStep("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="size-5 text-primary" /> Nouveau projet
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setMode("static")}
              className={cn("flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors",
                mode === "static" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
            >
              <Code2 className="size-4" /> Parser statique
            </button>
            <button
              onClick={() => setMode("ai")}
              className={cn("flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors",
                mode === "ai" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
            >
              <Sparkles className="size-4" /> Analyse IA
            </button>
          </div>

          {/* AI options */}
          {mode === "ai" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="relative">
                <select
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
                  className="w-full appearance-none rounded-md border border-border bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              {provider !== "ollama" && (
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder="Clé API…"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="pr-9 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Folder picker */}
          <div className="flex gap-2">
            <Input
              value={folderPath}
              readOnly
              placeholder="Chemin du dossier…"
              className="flex-1 text-sm"
            />
            <Button variant="outline" size="sm" onClick={pickFolder} className="shrink-0 gap-1.5">
              <FolderOpen className="size-4" /> Parcourir
            </Button>
          </div>

          <Button
            className="w-full gap-2"
            onClick={analyze}
            disabled={loading || !folderPath}
          >
            {loading ? (
              <><Loader2 className="size-4 animate-spin" /> {step || "Analyse…"}</>
            ) : (
              <><Sparkles className="size-4" /> Analyser</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
